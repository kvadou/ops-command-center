const { Pool } = require("pg");
const { parseUTC, toNY } = require("./utils/date");
const helpers = require("./helpers");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:REPLACE_ME@localhost:5432/acme_ops_demo",
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatIntegerReport(rep) {
  return {
    ytd: integerFormatter.format(rep.ytd),
    months: Object.fromEntries(
      Object.entries(rep.months).map(([m, v]) => [
        m,
        integerFormatter.format(v),
      ])
    ),
  };
}

function formatCurrencyReport(rep) {
  return {
    ytd: currencyFormatter.format(rep.ytd),
    months: Object.fromEntries(
      Object.entries(rep.months).map(([m, v]) => [
        m,
        currencyFormatter.format(v),
      ])
    ),
  };
}

function formatDecimalReport(rep) {
  return {
    ytd: decimalFormatter.format(rep.ytd),
    months: Object.fromEntries(
      Object.entries(rep.months).map(([m, v]) => [
        m,
        decimalFormatter.format(v),
      ])
    ),
  };
}


async function generateMasterReport(yearInt, startDate, endDate) {
  const client = await pool.connect();
  try {
    const startUTC = toNY(parseUTC(startDate)).startOf("day").toUTC().toISO();
    const endUTC = toNY(parseUTC(endDate)).endOf("day").toUTC().toISO();

    let [
      lessons,
      revenueByLabel,
      paidByLabel,
      lessonHours,
      students,
      revenue,
      paidRevenue,
      grossProfitMargin,
      netProfitMargin,
      homeLessons,
      homeRevenue,
      onlineLessons,
      onlineRevenue,
      leads,
      convertedLeads,
      unconvertedLeads,
      lessonsPlaced,
      trialLessons,
      convertedNotContinued,
      threeLessons,
      sevenLessons,
      activeTutors,
      inactiveTutors,
      tutorPay,
      tutorAdhocPay,
      tutors0_19,
      tutors20_39,
      tutors40_59,
      tutors60_79,
      tutors80Plus,
      consistencyBonus,
      groupStudents,
      groupBonus,
      additionalStudents,
      labelBreakdown,
      expectedTutorPay,
    ] = await Promise.all([
      helpers.getLessonsReport(client, yearInt),
      helpers.getRevenueByLabel(client, startUTC, endUTC),
      helpers.getPaidRevenueByLabel(client, startUTC, endUTC),
      helpers.getLessonHoursReport(client, yearInt),
      helpers.getStudentsReport(client, yearInt),
      helpers.getExpectedRevenueReport(client, yearInt),
      helpers.getPaidRevenueReport(client, yearInt),
      helpers.getGrossProfitMarginReport(client, yearInt),
      helpers.getNetProfitMarginReport(client, yearInt),
      helpers.getHomeLessonsReport(client, yearInt),
      helpers.getHomeRevenueReport(client, yearInt),
      helpers.getOnlineLessonsReport(client, yearInt),
      helpers.getOnlineRevenueReport(client, yearInt),
      helpers.getLeadsReport(client, yearInt),
      helpers.getConvertedLeadsReport(client, startUTC, endUTC),
      helpers.getUnconvertedLeadsReport(client, startUTC, endUTC),
      helpers.getLessonsPlacedReport(client, yearInt),
      helpers.getTrialLessonsReport(client, startUTC, endUTC),
      helpers.getConvertedNotContinuedReport(client, startUTC, endUTC),
      helpers.getThreeLessonsReport(client, yearInt),
      helpers.getSevenLessonsReport(client, yearInt),
      helpers.getActiveTutorsReport(client, yearInt),
      helpers.getInactiveTutorsReport(client, yearInt),
      helpers.getTutorPayReport(client, startUTC, endUTC),
      helpers.getTutorAdhocPayReport(client, startUTC, endUTC),
      helpers.getTutorsByHoursReport(client, yearInt, 0, 20),
      helpers.getTutorsByHoursReport(client, yearInt, 20, 40),
      helpers.getTutorsByHoursReport(client, yearInt, 40, 60),
      helpers.getTutorsByHoursReport(client, yearInt, 60, 80),
      helpers.getTutorsByHoursReport(client, yearInt, 80, null),
      helpers.getConsistencyBonusReport(client, yearInt),
      helpers.getGroupStudentsReport(client, yearInt),
      helpers.getGroupBonusReport(client, yearInt),
      helpers.getAdditionalStudentsReport(client, yearInt),
      helpers.getLabelBreakdown(client, startUTC, endUTC),
      helpers.getExpectedTutorPayReport(client, yearInt),
    ]);

    const labels = new Set([
      ...Object.keys(revenueByLabel),
      ...Object.keys(paidByLabel),
    ]);

    const merged = {};
    for (const label of labels) {
      merged[label] = {
        expectedRevenue: revenueByLabel[label]?.expectedRevenue || 0,
        paidRevenue: paidByLabel[label]?.paidRevenue || 0,
      };
    }

    const monthKey = toNY(parseUTC(startDate)).toFormat("LLL").toLowerCase();
    const revenueByDivision = {
      [monthKey]: merged,
    };

    revenue = formatCurrencyReport(revenue);
    paidRevenue = formatCurrencyReport(paidRevenue);
    homeRevenue = formatCurrencyReport(homeRevenue);
    onlineRevenue = formatCurrencyReport(onlineRevenue);
    tutorPay = formatCurrencyReport(tutorPay);
    tutorAdhocPay = formatCurrencyReport(tutorAdhocPay);
    expectedTutorPay = formatCurrencyReport(expectedTutorPay);

    consistencyBonus = formatCurrencyReport(consistencyBonus);
    groupBonus = formatCurrencyReport(groupBonus);
    additionalStudents = formatIntegerReport(additionalStudents);

    const hours = formatDecimalReport(lessonHours);

    lessons = formatIntegerReport(lessons);
    students = formatIntegerReport(students);
    leads = formatIntegerReport(leads);
    convertedLeads = formatIntegerReport(convertedLeads);
    unconvertedLeads = formatIntegerReport(unconvertedLeads);
    lessonsPlaced = formatIntegerReport(lessonsPlaced);
    trialLessons = formatIntegerReport(trialLessons);
    convertedNotContinued = formatIntegerReport(convertedNotContinued);
    threeLessons = formatIntegerReport(threeLessons);
    sevenLessons = formatIntegerReport(sevenLessons);
    activeTutors = formatIntegerReport(activeTutors);
    inactiveTutors = formatIntegerReport(inactiveTutors);
    tutors0_19 = formatIntegerReport(tutors0_19);
    tutors20_39 = formatIntegerReport(tutors20_39);
    tutors40_59 = formatIntegerReport(tutors40_59);
    tutors60_79 = formatIntegerReport(tutors60_79);
    tutors80Plus = formatIntegerReport(tutors80Plus);
    groupStudents = formatIntegerReport(groupStudents);

    const grossValues = Object.values(grossProfitMargin.months).filter(
      (v) => v !== 0
    );
    const netValues = Object.values(netProfitMargin.months).filter(
      (v) => v !== 0
    );
    grossProfitMargin.ytd = grossValues.length
      ? parseFloat(
          (grossValues.reduce((a, b) => a + b, 0) / grossValues.length).toFixed(
            2
          )
        )
      : 0;
    netProfitMargin.ytd = netValues.length
      ? parseFloat(
          (netValues.reduce((a, b) => a + b, 0) / netValues.length).toFixed(2)
        )
      : 0;

    return {
      lessons,
      hours,
      students,
      revenue,
      paidRevenue,
      grossProfitMargin,
      netProfitMargin,
      home: homeLessons,
      homeRevenue,
      online: onlineLessons,
      onlineRevenue,
      tutorPay,
      tutorAdhocPay,
      totalLeads: leads,
      convertedLeads,
      unconvertedLeads,
      lessonsPlaced,
      trialFirstLessons: trialLessons,
      convertedNotContinued,
      threeFullLessons: threeLessons,
      sevenFullLessons: sevenLessons,
      activeTutors,
      inactiveTutors,
      tutorsTaught0_19: tutors0_19,
      tutorsTaught20_39: tutors20_39,
      tutorsTaught40_59: tutors40_59,
      tutorsTaught60_79: tutors60_79,
      tutorTaught80Plus: tutors80Plus,
      consistencyBonusPayout: consistencyBonus,
      groupLessonCount: groupStudents,
      additionalStudents,
      groupLessonBonusPayout: groupBonus,
      revenueByDivision,
      revenueByLabel,
      paidByLabel,
      labelBreakdown,
      expectedTutorPay,
    };
  } finally {
    client.release();
  }
}

module.exports = {
  generateMasterReport,
};

const { getStudentsDetail } = require("./helpers");

if (require.main === module) {
  (async () => {
    const client = await pool.connect();
    try {
      const yearStart = toNY(parseUTC("2025-01-01"))
        .startOf("day")
        .toUTC()
        .toISO();
      const yearEnd = toNY(parseUTC("2025-12-31")).endOf("day").toUTC().toISO();

      const full = await generateMasterReport(2025, "2025-01-01", "2025-12-31");
      console.log(
        `💡 2025 December students (rolled-up):`,
        full.students.months.dec
      );

      const allDetails = await getStudentsDetail(client, yearStart, yearEnd);

      const decDetails = allDetails.filter((r) => {
        return new Date(r.lesson_start).getUTCMonth() === 11;
      });

      console.log(`\n[detail:students] December rows:`, decDetails.length);
      console.table(
        decDetails.map((r) => ({
          lesson_id: r.lesson_id,
          lesson_start: r.lesson_start,
          student_id: r.student_id,
        }))
      );
    } catch (err) {
      console.error(" December debug failed:", err);
    } finally {
      client.release();
      process.exit(0);
    }
  })();
}

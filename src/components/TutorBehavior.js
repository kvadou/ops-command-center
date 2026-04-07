import React, { useState } from "react";

const tabs = [
  { name: "Current Week", key: "currentWeek" },
  { name: "Month to Date", key: "mtd" },
  { name: "Year to Date", key: "ytd" },
  { name: "Lifetime", key: "lifetime" },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function TutorBehavior() {
  const [activeTab, setActiveTab] = useState("currentWeek");

  const tutors = [
    {
      tutor: "In Home",
      totalLessons: 50,
      totalStudents: 20,
      totalCancellationsTutor: 3,
      totalCancellationsClient: 2,
      trialsThisWeek: 5,
      trialsLastWeek: 4,
      paidLessonsScheduled: 2,
      paidLessonsCheckedOut: 1,
      referralsSubmitted: 3,
      referralsConverted: 2,
      revenue: 2000,
      opex: 500,
      reviews: "4.5/5",
    },
    {
      tutor: "Club",
      totalLessons: 45,
      totalStudents: 18,
      totalCancellationsTutor: 2,
      totalCancellationsClient: 1,
      trialsThisWeek: 6,
      trialsLastWeek: 3,
      paidLessonsScheduled: 3,
      paidLessonsCheckedOut: 2,
      referralsSubmitted: 4,
      referralsConverted: 3,
      revenue: 1800,
      opex: 450,
      reviews: "4.7/5",
    },
    {
      tutor: "Online",
      totalLessons: 45,
      totalStudents: 18,
      totalCancellationsTutor: 2,
      totalCancellationsClient: 1,
      trialsThisWeek: 6,
      trialsLastWeek: 3,
      paidLessonsScheduled: 3,
      paidLessonsCheckedOut: 2,
      referralsSubmitted: 4,
      referralsConverted: 3,
      revenue: 1800,
      opex: 450,
      reviews: "4.7/5",
    },
    {
      tutor: "School",
      totalLessons: 45,
      totalStudents: 18,
      totalCancellationsTutor: 2,
      totalCancellationsClient: 1,
      trialsThisWeek: 6,
      trialsLastWeek: 3,
      paidLessonsScheduled: 3,
      paidLessonsCheckedOut: 2,
      referralsSubmitted: 4,
      referralsConverted: 3,
      revenue: 1800,
      opex: 450,
      reviews: "4.7/5",
    },
  ];

  const totalLessons = tutors.reduce(
    (sum, tutor) => sum + tutor.totalLessons,
    0
  );
  const totalStudents = tutors.reduce(
    (sum, tutor) => sum + tutor.totalStudents,
    0
  );
  const totalCancellationsTutor = tutors.reduce(
    (sum, tutor) => sum + tutor.totalCancellationsTutor,
    0
  );
  const totalCancellationsClient = tutors.reduce(
    (sum, tutor) => sum + tutor.totalCancellationsClient,
    0
  );
  const totalTrialsThisWeek = tutors.reduce(
    (sum, tutor) => sum + tutor.trialsThisWeek,
    0
  );
  const totalTrialsLastWeek = tutors.reduce(
    (sum, tutor) => sum + tutor.trialsLastWeek,
    0
  );
  const totalPaidLessonsScheduled = tutors.reduce(
    (sum, tutor) => sum + tutor.paidLessonsScheduled,
    0
  );
  const totalPaidLessonsCheckedOut = tutors.reduce(
    (sum, tutor) => sum + tutor.paidLessonsCheckedOut,
    0
  );
  const totalReferralsSubmitted = tutors.reduce(
    (sum, tutor) => sum + tutor.referralsSubmitted,
    0
  );
  const totalReferralsConverted = tutors.reduce(
    (sum, tutor) => sum + tutor.referralsConverted,
    0
  );
  const totalRevenue = tutors.reduce((sum, tutor) => sum + tutor.revenue, 0);
  const totalOpex = tutors.reduce((sum, tutor) => sum + tutor.opex, 0);

  const renderTable = () => {
    return (
      <div className="-mx-4 mt-8 flow-root sm:mx-0">
        <table className="min-w-full divide-y divide-neutral-300">
          <thead className="border-b border-neutral-300 text-neutral-900">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
                Service Type
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Total Lessons
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Total Students
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Cancellations by Tutor
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Cancellations by Client
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Trials This Week
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Trials Last Week
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Paid Lessons Scheduled
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Paid Lessons Checked Out
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Referrals Submitted
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Referrals Converted
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Revenue
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Opex
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Tutor Reviews
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {tutors.map((tutor, index) => (
              <tr key={index} className="border-b border-neutral-200">
                <td className="py-5 pl-4 pr-3 text-sm text-neutral-900 sm:pl-0">
                  <div className="font-medium">{tutor.tutor}</div>
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.totalLessons}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.totalStudents}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.totalCancellationsTutor}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.totalCancellationsClient}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.trialsThisWeek}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.trialsLastWeek}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.paidLessonsScheduled}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.paidLessonsCheckedOut}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.referralsSubmitted}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.referralsConverted}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  ${tutor.revenue.toLocaleString()}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  ${tutor.opex.toLocaleString()}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {tutor.reviews}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <th
                scope="row"
                className="pl-4 pr-3 pt-6 text-left text-sm font-semibold text-neutral-900 sm:pl-0"
              >
                Totals
              </th>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalLessons}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalStudents}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalCancellationsTutor}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalCancellationsClient}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalTrialsThisWeek}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalTrialsLastWeek}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalPaidLessonsScheduled}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalPaidLessonsCheckedOut}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalReferralsSubmitted}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalReferralsConverted}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                ${totalRevenue.toLocaleString()}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                ${totalOpex.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div className="sm:hidden">
        <select
          id="tabs"
          name="tabs"
          defaultValue={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          className="block w-full rounded-md border-neutral-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
        >
          {tabs.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tab.name}
            </option>
          ))}
        </select>
      </div>
      <div className="hidden sm:block">
        <div className="border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={classNames(
                  activeTab === tab.key
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700",
                  "whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium"
                )}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {activeTab === "currentWeek" && (
        <>
          <h2 className="text-lg font-semibold leading-6 text-neutral-900 mt-8">
            Current Week
          </h2>
          {renderTable()}
        </>
      )}
      {activeTab === "mtd" && (
        <>
          <h2 className="text-lg font-semibold leading-6 text-neutral-900 mt-8">
            Month to Date
          </h2>
          {renderTable()}
        </>
      )}
      {activeTab === "ytd" && (
        <>
          <h2 className="text-lg font-semibold leading-6 text-neutral-900 mt-8">
            Year to Date
          </h2>
          {renderTable()}
        </>
      )}
      {activeTab === "lifetime" && (
        <>
          <h2 className="text-lg font-semibold leading-6 text-neutral-900 mt-8">
            Lifetime
          </h2>
          {renderTable()}
        </>
      )}
    </div>
  );
}

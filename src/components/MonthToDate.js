import React from "react";

const stats = [
  { name: "Total Lessons", value: "200" },
  { name: "Total Students", value: "120" },
  { name: "Cancellations by Tutor", value: "10" },
  { name: "Cancellations by Client", value: "8" },
  { name: "Trials Conducted This Month", value: "30" },
  { name: "Trials Conducted Last Month", value: "25" },
  { name: "1st Paid Lesson Scheduled", value: "10" },
  { name: "1st Paid Lessons Checked Out", value: "8" },
  { name: "Referrals Submitted", value: "7" },
  { name: "Referrals Converted", value: "5" },
  { name: "Revenue", value: "$30,000" },
  { name: "Opex", value: "$7,500" },
];

const MonthToDate = () => {
  return (
    <div>
      <dl className="mx-auto grid grid-cols-1 gap-6 bg-white-900/5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 bg-white px-4 py-10 sm:px-6 xl:px-8 shadow rounded-lg"
          >
            <dt className="text-sm font-medium leading-6 text-neutral-500">
              {stat.name}
            </dt>
            <dd className="w-full flex-none text-3xl font-medium leading-10 tracking-tight text-neutral-900">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default MonthToDate;

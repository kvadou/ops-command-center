import React from "react";

const stats = [
  { name: "Total Lessons", value: "200" },
  {
    name: "Total Students",
    value: "150",
    change: "+8%",
    changeType: "positive",
  },
  {
    name: "Cancellations by Tutor",
    value: "3",
    change: "-1%",
    changeType: "positive",
  },
  {
    name: "Cancellations by Client",
    value: "2",
    change: "+1%",
    changeType: "negative",
  },
  {
    name: "Trials Conducted This Week",
    value: "15",
    change: "+5%",
    changeType: "positive",
  },
  {
    name: "Trials Conducted Last Week",
    value: "12",
    change: "-1%",
    changeType: "negative",
  },
  {
    name: "1st Paid Lesson Scheduled",
    value: "5",
    change: "+2%",
    changeType: "positive",
  },
  {
    name: "1st Paid Lessons Checked Out",
    value: "4",
    change: "+1%",
    changeType: "positive",
  },
  {
    name: "Referrals Submitted",
    value: "7",
    change: "+3%",
    changeType: "positive",
  },
  {
    name: "Referrals Converted",
    value: "5",
    change: "+2%",
    changeType: "positive",
  },
  { name: "Revenue", value: "$10,000", change: "+4%", changeType: "positive" },
  { name: "Opex", value: "$2,500", change: "+10%", changeType: "negative" },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

const CurrentWeek = () => {
  return (
    <div>
      <dl className="mx-auto grid grid-cols-1 gap-4 bg-white-900/5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 bg-white px-4 py-10 sm:px-6 xl:px-8 shadow rounded-lg"
          >
            <dt className="text-sm font-medium leading-6 text-neutral-500">
              {stat.name}
            </dt>
            <dd
              className={classNames(
                stat.changeType === "negative"
                  ? "text-rose-600"
                  : stat.changeType === "positive"
                  ? "text-green-600"
                  : "text-neutral-600",
                "text-xs font-medium"
              )}
            >
              {stat.change}
            </dd>
            <dd className="w-full flex-none text-3xl font-medium leading-10 tracking-tight text-neutral-900">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default CurrentWeek;

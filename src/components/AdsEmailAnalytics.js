import React from "react";

const stats = [
  { name: "Clicks per Ad", value: "500" },
  { name: "Registrations per Ad", value: "45" },
  { name: "Took First Paid Class (Ad Clients)", value: "20" },
  { name: "Conversions (Spent $300+)", value: "30" },
  { name: "Trials Taken by Ad Clients", value: "10" },
  { name: "First Lessons by Ad Clients", value: "5" },
  { name: "Email Click Rate", value: "35%" },
  { name: "Registration per Email", value: "15" },
  { name: "Took First Paid Class (Email Clients)", value: "12" },
  { name: "Conversions (Spent $300+) (Email Clients)", value: "8" },
  { name: "Trials Taken by Email Clients", value: "7" },
  { name: "First Lessons by Email Clients", value: "3" },
];

const AdsEmailAnalytics = () => {
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

export default AdsEmailAnalytics;

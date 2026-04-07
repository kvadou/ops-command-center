import React from "react";

const data = [
  {
    type: "In-Home",
    stoppedAfter3Weeks: 5,
    leadsFromWebsite: 12,
    leadsFromEmail: 8,
    leadsFromAds: 6,
    referrals: 3,
    bundlesPurchased: 10,
  },
  {
    type: "Club",
    stoppedAfter3Weeks: 3,
    leadsFromWebsite: 10,
    leadsFromEmail: 7,
    leadsFromAds: 5,
    referrals: 2,
    bundlesPurchased: 7,
  },
  {
    type: "Online",
    stoppedAfter3Weeks: 4,
    leadsFromWebsite: 15,
    leadsFromEmail: 9,
    leadsFromAds: 8,
    referrals: 5,
    bundlesPurchased: 12,
  },
  {
    type: "Schools",
    stoppedAfter3Weeks: 2,
    leadsFromWebsite: 5,
    leadsFromEmail: 4,
    leadsFromAds: 3,
    referrals: 1,
    bundlesPurchased: 5,
  },
];

const ClientBehavior = () => {
  const totalStopped = data.reduce(
    (sum, row) => sum + row.stoppedAfter3Weeks,
    0
  );
  const totalLeadsFromWebsite = data.reduce(
    (sum, row) => sum + row.leadsFromWebsite,
    0
  );
  const totalLeadsFromEmail = data.reduce(
    (sum, row) => sum + row.leadsFromEmail,
    0
  );
  const totalLeadsFromAds = data.reduce(
    (sum, row) => sum + row.leadsFromAds,
    0
  );
  const totalReferrals = data.reduce((sum, row) => sum + row.referrals, 0);
  const totalBundlesPurchased = data.reduce(
    (sum, row) => sum + row.bundlesPurchased,
    0
  );

  const dayOfWeekData = [
    {
      type: "In-Home",
      monday: 10,
      tuesday: 8,
      wednesday: 6,
      thursday: 9,
      friday: 7,
      saturday: 5,
      sunday: 2,
    },
    {
      type: "Club",
      monday: 7,
      tuesday: 6,
      wednesday: 5,
      thursday: 6,
      friday: 8,
      saturday: 3,
      sunday: 1,
    },
    {
      type: "Online",
      monday: 12,
      tuesday: 11,
      wednesday: 9,
      thursday: 10,
      friday: 8,
      saturday: 6,
      sunday: 4,
    },
    {
      type: "Schools",
      monday: 5,
      tuesday: 4,
      wednesday: 6,
      thursday: 3,
      friday: 4,
      saturday: 2,
      sunday: 1,
    },
  ];

  return (
    <div className="px-0 sm:px-0 lg:px-0">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <p className="mt-2 text-sm text-neutral-700">
            Overview of client behavior, including leads, referrals, and bundles
            purchased across different service types.
          </p>
        </div>
      </div>

      <div className="-mx-4 mt-8 flow-root sm:mx-0">
        <table className="min-w-full divide-y divide-neutral-300">
          <thead className="border-b border-neutral-300 text-neutral-900">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
                Service Type
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Stopped After 3 Weeks
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Leads From Website
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Leads From Email
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Leads From Ads
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Referrals
              </th>

              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Bundles Purchased
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {data.map((row, index) => (
              <tr key={index} className="border-b border-neutral-200">
                <td className="py-5 pl-4 pr-3 text-sm sm:pl-0">
                  <div className="font-medium text-neutral-900">{row.type}</div>
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {row.stoppedAfter3Weeks}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {row.leadsFromWebsite}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {row.leadsFromEmail}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {row.leadsFromAds}
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {row.referrals}
                </td>

                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {row.bundlesPurchased}
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
                {totalStopped}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalLeadsFromWebsite}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalLeadsFromEmail}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalLeadsFromAds}
              </td>
              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalReferrals}
              </td>

              <td className="px-3 py-5 text-right text-sm font-semibold text-neutral-900">
                {totalBundlesPurchased}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="px-0 sm:px-0 lg:px-0 mt-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h2 className="text-xl font-semibold leading-6 text-neutral-900">
              Day of the Week Breakdown
            </h2>
            <p className="mt-2 text-sm text-neutral-700">
              Overview of lesson distribution across different days of the week
              for each service type.
            </p>
          </div>
        </div>

        <div className="-mx-4 mt-8 flow-root sm:mx-0">
          <table className="min-w-full divide-y divide-neutral-300">
            <thead className="border-b border-neutral-300 text-neutral-900">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
                  Service Type
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Monday
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Tuesday
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Wednesday
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Thursday
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Friday
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Saturday
                </th>
                <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                  Sunday
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {dayOfWeekData.map((row, index) => (
                <tr key={index} className="border-b border-neutral-200">
                  <td className="py-5 pl-4 pr-3 text-sm sm:pl-0">
                    <div className="font-medium text-neutral-900">{row.type}</div>
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.monday}
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.tuesday}
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.wednesday}
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.thursday}
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.friday}
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.saturday}
                  </td>
                  <td className="px-3 py-5 text-right text-sm text-neutral-500">
                    {row.sunday}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientBehavior;

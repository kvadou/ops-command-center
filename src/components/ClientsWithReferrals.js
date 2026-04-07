import React from "react";

const topClients = [
  {
    client: "Client A",
    lessonsMTD: 30,
    lessonsYTD: 150,
    lessonsLifetime: 500,
    referrals: 5,
  },
  {
    client: "Client B",
    lessonsMTD: 25,
    lessonsYTD: 140,
    lessonsLifetime: 450,
    referrals: 4,
  },
];

const ClientsWithReferrals = () => {
  const totalReferrals = topClients.reduce(
    (sum, client) => sum + client.referrals,
    0
  );

  return (
    <div className="px-0 sm:px-0 lg:px-0">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <p className="mt-2 text-sm text-neutral-700">
            Clients who gave referrals, with stats on referrals month-to-date
            (MTD), year-to-date (YTD), and lifetime.
          </p>
        </div>
      </div>
      <div className="-mx-4 mt-8 flow-root sm:mx-0">
        <table className="min-w-full divide-y divide-neutral-300">
          <thead className="border-b border-neutral-300 text-neutral-900">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
                Client
              </th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-neutral-900">
                Referrals
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {topClients.map((client, index) => (
              <tr key={index} className="border-b border-neutral-200">
                <td className="py-5 pl-4 pr-3 text-sm sm:pl-0">
                  <div className="font-medium text-neutral-900">
                    {client.client}
                  </div>
                </td>
                <td className="px-3 py-5 text-right text-sm text-neutral-500">
                  {client.referrals}
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
                {totalReferrals}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default ClientsWithReferrals;

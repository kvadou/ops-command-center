import React from "react";
import ActiveClientsLessons from "./ActiveClientsLessons";
import ClientsWithReferrals from "./ClientsWithReferrals";

const BigStats = () => {
  return (
    <div className="px-0 sm:px-0 lg:px-0">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <p className="mt-2 text-sm text-neutral-700">
            Summary of the most active clients, including lessons and referrals.
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-xl font-semibold text-neutral-900">
        Active Clients - Lessons MTD, YTD, and Lifetime
      </h2>
      <ActiveClientsLessons />

      <h2 className="mt-8 text-xl font-semibold text-neutral-900">
        Clients Who Gave Referrals
      </h2>
      <ClientsWithReferrals />
    </div>
  );
};

export default BigStats;

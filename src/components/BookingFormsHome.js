import React from "react";
import { Link } from "react-router-dom";
import {
  DocumentChartBarIcon,
  CogIcon,
  WrenchIcon,
} from "@heroicons/react/24/outline";

const DashboardCard = ({ to, icon: Icon, title, description }) => {
  return (
    <Link to={to} className="block">
      <div className="flex items-center p-5 bg-white rounded-2xl shadow-sm hover:shadow-md transition border border-neutral-100">
        <Icon className="h-8 w-8 text-primary-500 mr-4 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-neutral-800">{title}</h3>
          <p className="text-sm text-neutral-500">{description}</p>
        </div>
      </div>
    </Link>
  );
};

export default function BookingFormsHome() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <DashboardCard
          to="/booking-forms/submissions"
          icon={DocumentChartBarIcon}
          title="Form Submissions"
          description="View submitted booking forms and client data."
        />
        <DashboardCard
          to="/booking-forms/config"
          icon={CogIcon}
          title="Form Configuration"
          description="Manage form booking types, labels and pricing."
        />
      </div>
    </div>
  );
}

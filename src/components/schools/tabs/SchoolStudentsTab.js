import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UserIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';

export default function SchoolStudentsTab({ school }) {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Extract students from school jobs
    const allStudents = [];
    const studentMap = new Map();

    (school.jobs || []).forEach(job => {
      (job.students || []).forEach(student => {
        const key = student.student_id || student.recipient_id;
        if (key && !studentMap.has(key)) {
          studentMap.set(key, {
            id: key,
            name: student.student_name || student.recipient_name || 'Unknown',
            clientId: student.client_id || student.paying_client_id,
            clientName: student.client_name || student.paying_client_name,
            enrollmentStatus: student.enrollment_status || 'active',
            jobName: job.serviceName,
            jobId: job.serviceId
          });
        }
      });
    });

    setStudents(Array.from(studentMap.values()));
    setLoading(false);
  }, [school]);

  useEffect(() => {
    let filtered = [...students];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(student =>
        student.name?.toLowerCase().includes(search) ||
        student.clientName?.toLowerCase().includes(search)
      );
    }

    // Sort alphabetically
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    setFilteredStudents(filtered);
  }, [students, searchTerm]);

  const getStatusBadge = (status) => {
    const isActive = status === 'active' || status === 'enrolled';
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-800'
      }`}>
        {isActive ? <CheckCircleIcon className="h-3 w-3" /> : <XCircleIcon className="h-3 w-3" />}
        {status || 'Unknown'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search students..."
            className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center">
            <UserGroupIcon className="mx-auto h-12 w-12 text-neutral-400" />
            <h3 className="mt-2 text-sm font-medium text-neutral-900">No students found</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {searchTerm
                ? 'Try adjusting your search'
                : 'No students have been enrolled at this school yet'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Student Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Paying Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Job</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {filteredStudents.map((student, index) => (
                  <tr key={student.id || index} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-purple/10 flex items-center justify-center flex-shrink-0">
                          <UserIcon className="h-4 w-4 text-brand-purple" />
                        </div>
                        <Link
                          to={`/students/${student.id}`}
                          className="text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
                        >
                          {student.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      {student.clientId ? (
                        <Link
                          to={`/clients/${student.clientId}`}
                          className="text-brand-purple hover:text-brand-navy hover:underline"
                        >
                          {student.clientName || 'View Client'}
                        </Link>
                      ) : (
                        student.clientName || 'N/A'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      {student.jobId ? (
                        <Link
                          to={`/jobs/${student.jobId}`}
                          className="text-brand-purple hover:text-brand-navy hover:underline"
                        >
                          {student.jobName || 'View Job'}
                        </Link>
                      ) : (
                        student.jobName || 'N/A'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(student.enrollmentStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Total Students</p>
          <p className="text-2xl font-bold text-neutral-900">{students.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Active</p>
          <p className="text-2xl font-bold text-green-600">
            {students.filter(s => s.enrollmentStatus === 'active' || s.enrollmentStatus === 'enrolled').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 text-center">
          <p className="text-sm text-neutral-500">Inactive</p>
          <p className="text-2xl font-bold text-neutral-500">
            {students.filter(s => s.enrollmentStatus !== 'active' && s.enrollmentStatus !== 'enrolled').length}
          </p>
        </div>
      </div>
    </div>
  );
}

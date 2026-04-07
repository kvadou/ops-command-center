import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { useToast } from '../hooks/useToast';
import { fetchRevenueData } from "../utils/apiUtils";
import dayjs from 'dayjs';
import SyncManager from './SyncManager';
import BadMarginAlerts from './BadMarginAlerts';
import ImagesManager from '../clubs/settings/ImagesManager';
import QRCodesManager from '../clubs/settings/QRCodesManager';
import ReportPreview from './reports/ReportPreview';
import InvoiceCollectionsSettings from './settings/InvoiceCollectionsSettings';

// Valid tab names for URL persistence
const VALID_TABS = [
  "Divisions", "CampaignRenames", "CampaignSpend",
  "AnalyticsConfig", "ReportDistribution", "SyncManager", "BadMarginAlerts",
  "Images", "QRCodes", "SchoolRevenue", "CurriculumConfig", "InvoiceCollections"
];

const Settings = () => {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get initial tab from URL or default to "Divisions"
  const urlTab = searchParams.get("tab");
  const initialTab = VALID_TABS.includes(urlTab) ? urlTab : "ReportDistribution";
  
  const [divisions, setDivisions] = useState([]);
  const [newDivision, setNewDivision] = useState({ label: "", division: "" });
  const [editDivision, setEditDivision] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab); 
  const [editSchoolRevenue, setEditSchoolRevenue] = useState(null);

const [editCampaignRename, setEditCampaignRename] = useState(null);
const [editCampaignSpend, setEditCampaignSpend] = useState(null);

const [emailTemplates, setEmailTemplates] = useState([]);
const [newTemplate, setNewTemplate] = useState({ name: "", subject: "", content: "" });
const [editTemplate, setEditTemplate] = useState(null);

const [curriculumModules, setCurriculumModules] = useState([]);
const [editingCurriculum, setEditingCurriculum] = useState(null); // holds working copy
const [savingCurriculum, setSavingCurriculum] = useState(false);

const [campaignSpendRecords, setCampaignSpendRecords] = useState([]);
const [newCampaignSpend, setNewCampaignSpend] = useState({
  campaign: "",
  month: "",
  year: "",
  totalCost: "",
});


const fetchCampaignSpendRecords = async () => {
  try {
    const response = await axios.get("/api/campaign-spend");
    setCampaignSpendRecords(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error("Error fetching campaign spend records:", error);
  }
};

const fetchCurriculumConfig = async () => {
  try {
    const response = await axios.get("/api/student-management/curriculum-config");
    setCurriculumModules(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error("Error fetching curriculum config:", error);
  }
};

const handleSaveCurriculum = async () => {
  if (!editingCurriculum) return;
  setSavingCurriculum(true);
  try {
    await axios.put("/api/student-management/curriculum-config", { modules: editingCurriculum });
    toast.success("Curriculum configuration saved");
    setCurriculumModules(editingCurriculum);
    setEditingCurriculum(null);
  } catch (error) {
    console.error("Error saving curriculum config:", error);
    toast.error(error.response?.data?.error || "Failed to save curriculum config");
  } finally {
    setSavingCurriculum(false);
  }
};

const updateCurriculumField = (index, field, value) => {
  setEditingCurriculum(prev => {
    const updated = [...prev];
    updated[index] = { ...updated[index], [field]: value };
    return updated;
  });
};

const handleEditCampaignSpend = async (id, updatedSpend) => {
  try {
    await axios.put(`/api/campaign-spend/${id}`, updatedSpend);
    fetchCampaignSpendRecords();
    setEditCampaignSpend(null);
  } catch (error) {
    console.error("Error updating campaign spend record:", error);
  }
};

const handleDeleteCampaignSpend = async (id) => {
  try {
    await axios.delete(`/api/campaign-spend/${id}`);
    fetchCampaignSpendRecords();
  } catch (error) {
    console.error("Error deleting campaign spend record:", error);
  }
};



useEffect(() => {
  if (activeTab === "CampaignSpend") {
    fetchCampaignSpendRecords();
  }
  if (activeTab === "AnalyticsConfig") {
    fetchAnalyticsConfig();
  }
  if (activeTab === "ReportDistribution") {
    fetchReportDistributionLists();
    fetchReportHistory();
  }
  if (activeTab === "CurriculumConfig") {
    fetchCurriculumConfig();
  }
}, [activeTab]);


const handleAddCampaignSpend = async () => {
  try {
    await axios.post("/api/campaign-spend", newCampaignSpend);
    setNewCampaignSpend({ campaign: "", month: "", year: "", totalCost: "" });
    fetchCampaignSpendRecords();
  } catch (error) {
    console.error("Error adding campaign spend record:", error);
  }
};


const fetchEmailTemplates = async () => {
  try {
    const response = await axios.get("/api/email-templates");
    setEmailTemplates(response.data);
  } catch (error) {
    console.error("Error fetching email templates:", error);
  }
};


const handleAddTemplate = async () => {
  try {
    await axios.post("/api/email-templates", newTemplate);
    setNewTemplate({ name: "", subject: "", content: "" });
    fetchEmailTemplates();
  } catch (error) {
    console.error("Error adding email template:", error);
  }
};


const handleEditTemplate = async (id, updatedTemplate) => {
  try {
    await axios.put(`/api/email-templates/${id}`, updatedTemplate);
    setEditTemplate(null);
    fetchEmailTemplates();
  } catch (error) {
    console.error("Error updating email template:", error);
  }
};


const [deleteTemplateId, setDeleteTemplateId] = useState(null);

const handleDeleteTemplate = async () => {
  if (!deleteTemplateId) return;
  try {
    await axios.delete(`/api/email-templates/${deleteTemplateId}`);
    setDeleteTemplateId(null);
    fetchEmailTemplates();
  } catch (error) {
    console.error("Error deleting email template:", error);
    setDeleteTemplateId(null);
  }
};


useEffect(() => {
  if (activeTab === "EmailTemplates") {
    fetchEmailTemplates();
  }
}, [activeTab]);


const [schoolRevenues, setSchoolRevenues] = useState([]); 
const [newSchoolRevenue, setNewSchoolRevenue] = useState({
  school_name: "",
  month: "",
  revenue: "",
});


const [campaignRenames, setCampaignRenames] = useState([]);
const [newCampaignRename, setNewCampaignRename] = useState({
  campaign: "",
  label: "",
  cost: ""   
});
  const selectTab = (tab) => {
    setActiveTab(tab);
    // Update URL with the selected tab
    setSearchParams({ tab });
    if (tab === "AnalyticsConfig") {
      // Fire immediately so user sees data without relying solely on effect
      fetchAnalyticsConfig();
    }
  };
  const isQRCodesTab = activeTab === "QRCodes";


  // Analytics configuration (label groups, tutor buckets)
  const [analyticsConfig, setAnalyticsConfig] = useState(null);
  const [analyticsConfigText, setAnalyticsConfigText] = useState("");
  const [analyticsConfigStatus, setAnalyticsConfigStatus] = useState("");

  // Report Distribution Lists
  const [reportDistributionLists, setReportDistributionLists] = useState([]);
  const [newReportEmail, setNewReportEmail] = useState({ reportType: "weekly", email: "", name: "" });
  const [reportHistory, setReportHistory] = useState([]);
  const [reportHistoryLoading, setReportHistoryLoading] = useState(false);
  const [previewReportType, setPreviewReportType] = useState('weekly');
  const [previewWeekOffset, setPreviewWeekOffset] = useState(0);
  const [previewMonthOffset, setPreviewMonthOffset] = useState(0);

  const fetchAnalyticsConfig = async () => {
    try {
      const resp = await axios.get("/api/analytics/config", { withCredentials: true });
      console.log("[AnalyticsConfig] GET /api/analytics/config →", resp.status, resp.data);
      const data = resp.data || {};
      setAnalyticsConfig(data);
      setAnalyticsConfigText(JSON.stringify(data, null, 2));
      setAnalyticsConfigStatus("");
    } catch (e) {
      console.error("Error loading analytics config:", e);
      setAnalyticsConfigStatus("Failed to load config");
    }
  };

  const saveAnalyticsConfig = async () => {
    try {
      const parsed = JSON.parse(analyticsConfigText);
      await axios.put("/api/analytics/config", parsed, { withCredentials: true });
      setAnalyticsConfig(parsed);
      setAnalyticsConfigStatus("Saved");
    } catch (e) {
      console.error("Error saving analytics config:", e);
      setAnalyticsConfigStatus("Save failed. Check JSON.");
    }
  };

  const fetchReportDistributionLists = async () => {
    try {
      const response = await axios.get("/api/reports/distribution-lists", {
        withCredentials: true
      });
      setReportDistributionLists(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching report distribution lists:", error.response?.data || error.message || error);
      setReportDistributionLists([]);
    }
  };

  const handleAddReportEmail = async () => {
    try {
      await axios.post("/api/reports/distribution-lists", newReportEmail, {
        withCredentials: true
      });
      setNewReportEmail({ reportType: "weekly", email: "", name: "" });
      fetchReportDistributionLists();
    } catch (error) {
      console.error("Error adding report email:", error.response?.data || error.message || error);
      toast.error("Error adding email: " + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteReportEmail = async (id) => {
    try {
      await axios.delete(`/api/reports/distribution-lists/${id}`, {
        withCredentials: true
      });
      fetchReportDistributionLists();
    } catch (error) {
      console.error("Error deleting report email:", error.response?.data || error.message || error);
      toast.error("Error deleting email: " + (error.response?.data?.error || error.message));
    }
  };

  const handleToggleReportEmail = async (id) => {
    try {
      await axios.patch(`/api/reports/distribution-lists/${id}/toggle`, {}, {
        withCredentials: true
      });
      fetchReportDistributionLists();
    } catch (error) {
      console.error("Error toggling report email:", error.response?.data || error.message || error);
      toast.error("Error toggling email: " + (error.response?.data?.error || error.message));
    }
  };

  const handleSendTestReport = async (reportType) => {
    try {
      const response = await axios.post(`/api/reports/send/${reportType}`, {}, {
        withCredentials: true
      });
      toast.success(`Report sent successfully! Sent to ${response.data.sent} of ${response.data.total} recipients.`);
      fetchReportHistory(); // Refresh history after sending
    } catch (error) {
      console.error("Error sending test report:", error.response?.data || error.message || error);
      toast.error("Error sending report: " + (error.response?.data?.error || error.message));
    }
  };

  const fetchReportHistory = async () => {
    setReportHistoryLoading(true);
    try {
      const response = await axios.get("/api/reports/history", {
        params: { limit: 100 },
        withCredentials: true
      });
      setReportHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching report history:", error.response?.data || error.message || error);
      setReportHistory([]);
    } finally {
      setReportHistoryLoading(false);
    }
  };

  const handleDownloadReportPDF = async (reportSend) => {
    try {
      // Use the id field (which is MIN(id) from the grouped query) or construct download URL
      const reportId = reportSend.id;
      if (!reportId) {
        // If no id, we need to find a matching report send record
        // For now, use the first one - in the future we could add a dedicated endpoint
        toast.error("Unable to download PDF - report ID not found");
        return;
      }
      
      const response = await axios.get(`/api/reports/download/${reportId}`, {
        responseType: 'blob',
        withCredentials: true,
        validateStatus: function (status) {
          // Don't throw error for any status, we'll check manually
          return status >= 200 && status < 600;
        }
      });
      
      // Check response status first
      if (response.status !== 200) {
        // Try to parse error JSON from blob response
        let errorMessage = `Server error (${response.status})`;
        try {
          if (response.data instanceof Blob) {
            const text = await response.data.text();
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorData.details || errorMessage;
          }
        } catch (parseError) {
          // Couldn't parse, use default message
        }
        throw new Error(errorMessage);
      }
      
      // Check content type to ensure it's a PDF
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('application/pdf')) {
        // Response might be error JSON, try to parse it
        let errorMessage = 'Server returned non-PDF response';
        try {
          if (response.data instanceof Blob) {
            const text = await response.data.text();
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorData.details || errorMessage;
          }
        } catch (parseError) {
          // Couldn't parse, use default message
        }
        throw new Error(errorMessage);
      }
      
      // Create blob URL and trigger download
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const fileName = `${reportSend.report_type}_report_${reportSend.period_start}_to_${reportSend.period_end}.pdf`;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading report PDF:", error);
      // Extract error message
      const errorMessage = error.message || 'Unknown error occurred';
      toast.error("Error downloading report: " + errorMessage);
    }
  };



useEffect(() => {
  
  if (activeTab === "CampaignRenames" || activeTab === "CampaignSpend") {
    fetchCampaignRenames();
  }
}, [activeTab]);



const fetchCampaignRenames = async () => {
  try {
    const response = await axios.get("/api/campaign-renames");
    console.log("API Response:", response.data); 
    const validData = Array.isArray(response.data)
      ? response.data.filter(
          (item) => item && typeof item.campaign === "string" && item.campaign !== null
        )
      : [];
    console.log("Valid Campaign Renames:", validData);
    setCampaignRenames(validData);
  } catch (error) {
    console.error("Error fetching campaign renames:", error);
    setCampaignRenames([]);
  }
};


const handleAddCampaignRename = async () => {
  try {
    await axios.post("/api/campaign-renames", newCampaignRename);
    setNewCampaignRename({ campaign: "", label: "" });
    fetchCampaignRenames(); 
  } catch (error) {
    console.error("Error adding campaign rename:", error);
  }
};

const handleEditCampaignRename = async (id, updatedRename) => {
  try {
    await axios.put(`/api/campaign-renames/${id}`, updatedRename);
    fetchCampaignRenames();
  } catch (error) {
    console.error("Error updating campaign rename:", error);
  }
};

const handleDeleteCampaignRename = async (id) => {
  try {
    await axios.delete(`/api/campaign-renames/${id}`);
    fetchCampaignRenames();
  } catch (error) {
    console.error("Error deleting campaign rename:", error);
  }
};


  const startEditing = (division) => {
    setEditDivision(division);
  };
  
  const stopEditing = () => {
    setEditDivision(null);
  };
  
  const startEditingSchoolRevenue = (revenue) => {
    
    const formattedMonth = dayjs(revenue.month).format('MM/DD/YYYY');
    setEditSchoolRevenue({ ...revenue, month: formattedMonth });
  };
  
  
  const stopEditingSchoolRevenue = () => {
    setEditSchoolRevenue(null);
  };
  

  useEffect(() => {
    fetchDivisions();
  }, []);

  // Sync activeTab with URL when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && VALID_TABS.includes(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  const fetchDivisions = async () => {
    try {
      const response = await axios.get("/api/divisions");
      setDivisions(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching divisions:", error);
      setDivisions([]);
    }
  };
  
  const fetchRevenueData = async () => {
    try {
      const response = await axios.post(
        "/revenue-by-division",
        {
          startDate: "2024-01-01",
          endDate: "2024-12-31",
        }
      );

      console.log("Revenue data updated:", response.data);
    } catch (error) {
      console.error("Error fetching revenue data:", error);
    }
  };

  const fetchSchoolRevenues = async () => {
    try {
      const response = await axios.get("/api/school-revenues");
      setSchoolRevenues(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching school revenues:", error);
    }
  };
  
  const handleAddSchoolRevenue = async () => {
    try {
      
      const parsedMonth = dayjs(newSchoolRevenue.month, 'MM/DD/YYYY').format('YYYY-MM-DD');
  
      
      const newRevenueData = {
        ...newSchoolRevenue,
        month: parsedMonth,
      };
  
      await axios.post("/api/school-revenues", newRevenueData);
      setNewSchoolRevenue({ school_name: "", month: "", revenue: "" });
      fetchSchoolRevenues(); 
    } catch (error) {
      console.error("Error adding school revenue:", error);
    }
  };
  
  
  const handleDeleteSchoolRevenue = async (id) => {
    try {
      await axios.delete(`/api/school-revenues/${id}`);
      fetchSchoolRevenues(); 
    } catch (error) {
      console.error("Error deleting school revenue:", error);
    }
  };

  const handleEditSchoolRevenue = async (id, updatedRevenue) => {
    try {
      
      const parsedMonth = dayjs(updatedRevenue.month, 'MM/DD/YYYY').format('YYYY-MM-DD');
  
      const updatedRevenueData = {
        ...updatedRevenue,
        month: parsedMonth,
      };
  
      await axios.put(`/api/school-revenues/${id}`, updatedRevenueData);
      fetchSchoolRevenues(); 
      stopEditingSchoolRevenue();
    } catch (error) {
      console.error("Error updating school revenue:", error);
    }
  };
  
  
  
  
  useEffect(() => {
    if (activeTab === "SchoolRevenue") {
      fetchSchoolRevenues();
    }
  }, [activeTab]);
  

  const handleAddDivision = async () => {
    try {
      await axios.post("/api/divisions", newDivision);
      setNewDivision({ label: "", division: "" });
      fetchDivisions(); 
      
      fetchRevenueData(); 
    } catch (error) {
      console.error("Error adding division:", error);
    }
  };
  
  const handleEditDivision = async (id, updatedDivision) => {
    try {
      await axios.put(`/api/divisions/${id}`, updatedDivision);
      fetchDivisions(); 
      
      fetchRevenueData(); 
    } catch (error) {
      console.error("Error updating division:", error);
    }
  };
  
  const handleDeleteDivision = async (id) => {
    try {
      await axios.delete(`/api/divisions/${id}`);
      fetchDivisions(); 
      
      fetchRevenueData(); 
    } catch (error) {
      console.error("Error deleting division:", error);
    }
  };
  

  return (
    <div className="min-h-screen">
            <main className={`flex-1 min-w-0 ${isQRCodesTab ? "p-2 sm:p-3" : "p-6"}`}>

      {activeTab === "EmailTemplates" && (
  <>
    <h1 className="text-2xl font-bold mb-6">Email Templates</h1>

        <div className="overflow-x-auto mt-6">
      <table className="min-w-full divide-y divide-neutral-300">
        <thead>
          <tr>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Name
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Subject
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Content
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
  {emailTemplates.map((template) => (
    <tr key={template.id}>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
        {editTemplate?.id === template.id ? (
          <input
            type="text"
            value={editTemplate.name}
            onChange={(e) =>
              setEditTemplate({ ...editTemplate, name: e.target.value })
            }
            className="border p-1 rounded"
          />
        ) : (
          template.name
        )}

      {/* Analytics Config block will render below, outside of table contexts */}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editTemplate?.id === template.id ? (
          <input
            type="text"
            value={editTemplate.subject}
            onChange={(e) =>
              setEditTemplate({ ...editTemplate, subject: e.target.value })
            }
            className="border p-1 rounded"
          />
        ) : (
          template.subject
        )}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editTemplate?.id === template.id ? (
          <textarea
            value={editTemplate.content}
            onChange={(e) =>
              setEditTemplate({ ...editTemplate, content: e.target.value })
            }
            className="border p-2 rounded w-full"
          />
        ) : (
          <pre className="whitespace-pre-wrap">{template.content}</pre>
        )}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editTemplate?.id === template.id ? (
          <>
            <button
              onClick={() => handleEditTemplate(template.id, editTemplate)}
              className="mr-4 text-green-600"
            >
              Save
            </button>
            <button
              onClick={() => setEditTemplate(null)}
              className="text-red-600"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditTemplate(template)}
              className="mr-4 text-blue-600"
            >
              Edit
            </button>
            <button
              onClick={() => setDeleteTemplateId(template.id)}
              className="text-red-600"
            >
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  ))}
</tbody>

      </table>
    </div>

        <div className="bg-white shadow sm:rounded-lg mt-6">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold text-neutral-900">Add New Template</h3>
        <div className="flex flex-col gap-4 mt-4">
  <input
    type="text"
    placeholder="Name"
    value={newTemplate.name}
    onChange={(e) =>
      setNewTemplate({ ...newTemplate, name: e.target.value })
    }
    className="border p-2 rounded"
  />
  <input
    type="text"
    placeholder="Subject"
    value={newTemplate.subject}
    onChange={(e) =>
      setNewTemplate({ ...newTemplate, subject: e.target.value })
    }
    className="border p-2 rounded"
  />
  <textarea
    placeholder="Content"
    value={newTemplate.content}
    onChange={(e) =>
      setNewTemplate({ ...newTemplate, content: e.target.value })
    }
    className="border p-2 rounded"
  />
  <button
    onClick={handleAddTemplate}
    className="bg-blue-500 text-white px-4 py-2 rounded"
  >
    Add Template
  </button>
</div>

      </div>
    </div>

    {deleteTemplateId && (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Confirm Delete</h3>
          <p className="text-sm text-neutral-600 mb-4">
            Are you sure you want to permanently delete this email template? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDeleteTemplateId(null)}
              className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded hover:bg-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteTemplate}
              className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
  </>
)}

{activeTab === "CampaignSpend" && (
  <>
    <h1 className="text-2xl font-bold mb-6">Campaign Spend Tracker</h1>

        <div className="bg-white shadow sm:rounded-lg p-6 mb-6">
      <div className="flex flex-col gap-4">
        <div>
          <label className="block font-medium">Campaign</label>
          <select
  value={newCampaignSpend.campaign}
  onChange={(e) =>
    setNewCampaignSpend({ ...newCampaignSpend, campaign: e.target.value })
  }
  className="border p-2 rounded w-full"
>
  <option value="">Select campaign</option>
  {campaignRenames.map((rename) => (
    <option key={rename.id} value={rename.campaign}>
      {rename.label || rename.campaign}
    </option>
  ))}
</select>

        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block font-medium">Month</label>
            <select
              value={newCampaignSpend.month}
              onChange={(e) =>
                setNewCampaignSpend({ ...newCampaignSpend, month: e.target.value })
              }
              className="border p-2 rounded w-full"
            >
              <option value="">Select month</option>
              {[
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ].map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block font-medium">Year</label>
            <select
              value={newCampaignSpend.year}
              onChange={(e) =>
                setNewCampaignSpend({ ...newCampaignSpend, year: e.target.value })
              }
              className="border p-2 rounded w-full"
            >
              <option value="">Select year</option>
              {["2024", "2025", "2026"].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block font-medium">Total Cost ($)</label>
          <input
            type="number"
            placeholder="Enter total cost"
            value={newCampaignSpend.totalCost}
            onChange={(e) =>
              setNewCampaignSpend({ ...newCampaignSpend, totalCost: e.target.value })
            }
            className="border p-2 rounded w-full"
          />
        </div>

        <button
          onClick={handleAddCampaignSpend}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Record
        </button>
      </div>
    </div>

        <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-neutral-300">
        <thead>
          <tr>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900">
              Campaign
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900">
              Month
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900">
              Year
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900">
              Total Cost ($)
            </th>
                        <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
  {campaignSpendRecords.map((record) => (
    <tr key={record.id}>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editCampaignSpend?.id === record.id ? (
          <input
            type="text"
            value={editCampaignSpend.campaign}
            onChange={(e) =>
              setEditCampaignSpend({ ...editCampaignSpend, campaign: e.target.value })
            }
            className="border p-1 rounded"
          />
        ) : (
          record.campaign
        )}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editCampaignSpend?.id === record.id ? (
          <input
            type="number"
            value={editCampaignSpend.month}
            onChange={(e) =>
              setEditCampaignSpend({ ...editCampaignSpend, month: e.target.value })
            }
            className="border p-1 rounded"
          />
        ) : (
          record.month
        )}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editCampaignSpend?.id === record.id ? (
          <input
            type="number"
            value={editCampaignSpend.year}
            onChange={(e) =>
              setEditCampaignSpend({ ...editCampaignSpend, year: e.target.value })
            }
            className="border p-1 rounded"
          />
        ) : (
          record.year
        )}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editCampaignSpend?.id === record.id ? (
          <input
            type="number"
            value={editCampaignSpend.totalCost}
            onChange={(e) =>
              setEditCampaignSpend({ ...editCampaignSpend, totalCost: e.target.value })
            }
            className="border p-1 rounded"
          />
        ) : (
          `$${record.totalCost}`
        )}
      </td>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
        {editCampaignSpend?.id === record.id ? (
          <>
            <button
              onClick={() => handleEditCampaignSpend(record.id, editCampaignSpend)}
              className="mr-4 text-green-600"
            >
              Save
            </button>
            <button onClick={() => setEditCampaignSpend(null)} className="text-red-600">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditCampaignSpend(record)}
              className="mr-4 text-blue-600"
            >
              Edit
            </button>
            <button onClick={() => handleDeleteCampaignSpend(record.id)} className="text-red-600">
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  ))}
</tbody>

      </table>
    </div>
  </>
)}



      {activeTab === "CampaignRenames" && (
  <>
    <h1 className="text-2xl font-bold mb-6">Campaign Renaming</h1>

        <div className="overflow-x-auto mt-6">
      <table className="min-w-full divide-y divide-neutral-300">
        <thead>
          <tr>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Original Campaign</th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Friendly Label</th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Total Cost</th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {campaignRenames.map((rename) => (
            <tr key={rename.id}>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
                {editCampaignRename?.id === rename.id ? (
                  <input
                    type="text"
                    value={editCampaignRename.campaign}
                    onChange={(e) => setEditCampaignRename({ ...editCampaignRename, campaign: e.target.value })}
                    className="border p-1 rounded"
                  />
                ) : (
                  rename.campaign
                )}
              </td>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm  text-neutral-900 sm:pl-0">
                {editCampaignRename?.id === rename.id ? (
                  <input
                    type="text"
                    value={editCampaignRename.label}
                    onChange={(e) => setEditCampaignRename({ ...editCampaignRename, label: e.target.value })}
                    className="border p-1 rounded"
                  />
                ) : (
                  rename.label
                )}
              </td>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm  text-neutral-900 sm:pl-0">
                {editCampaignRename?.id === rename.id ? (
                  <input
                    type="number"
                    value={editCampaignRename.cost}
                    onChange={(e) => setEditCampaignRename({ ...editCampaignRename, cost: e.target.value })}
                    className="border p-1 rounded"
                  />
                ) : (
                  `$${rename.cost || 0}`
                )}
              </td>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
                {editCampaignRename?.id === rename.id ? (
                  <>
                    <button
                      onClick={() => {
                        handleEditCampaignRename(rename.id, editCampaignRename);
                        setEditCampaignRename(null);
                      }}
                      className="mr-4 text-green-600"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditCampaignRename(null)} className="text-red-600">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditCampaignRename(rename)} className="mr-4 text-blue-600">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteCampaignRename(rename.id)} className="text-red-600">
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

        <div className="bg-white shadow sm:rounded-lg mt-6">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold text-neutral-900">Add New Campaign Name</h3>
        <div className="flex gap-4 mt-4">
          <input
            type="text"
            placeholder="Original Campaign"
            value={newCampaignRename.campaign}
            onChange={(e) => setNewCampaignRename({ ...newCampaignRename, campaign: e.target.value })}
            className="border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Friendly Label"
            value={newCampaignRename.label}
            onChange={(e) => setNewCampaignRename({ ...newCampaignRename, label: e.target.value })}
            className="border p-2 rounded"
          />
          <input
            type="number"
            placeholder="Total Cost ($)"
            value={newCampaignRename.cost}
            onChange={(e) => setNewCampaignRename({ ...newCampaignRename, cost: e.target.value })}
            className="border p-2 rounded"
          />
          <button
            onClick={handleAddCampaignRename}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </>
)}



  {activeTab === "Divisions" && (
    <>
      <h1 className="text-2xl font-bold mb-6">Divisions</h1>
      <>
  <div className="overflow-x-auto mt-6">
    <table className="min-w-full divide-y divide-neutral-300">
      <thead>
        <tr>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Label</th>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Division</th>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200">
        {divisions.map((division) => (
          <tr key={division.id}>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
              {editDivision?.id === division.id ? (
                <input
                  type="text"
                  value={editDivision.label}
                  onChange={(e) =>
                    setEditDivision({ ...editDivision, label: e.target.value })
                  }
                  className="border p-1 rounded"
                />
              ) : (
                division.label
              )}
            </td>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
              {editDivision?.id === division.id ? (
                <input
                  type="text"
                  value={editDivision.division}
                  onChange={(e) =>
                    setEditDivision({ ...editDivision, division: e.target.value })
                  }
                  className="border p-1 rounded"
                />
              ) : (
                division.division
              )}
            </td>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
              {editDivision?.id === division.id ? (
                <>
                  <button
                    onClick={() => {
                      handleEditDivision(division.id, editDivision);
                      stopEditing();
                    }}
                    className="mr-4 text-green-600"
                  >
                    Save
                  </button>
                  <button onClick={stopEditing} className="text-red-600">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => startEditing(division)}
                    className="mr-4 text-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteDivision(division.id)}
                    className="text-red-600"
                  >
                    Delete
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  <div className="bg-white shadow sm:rounded-lg mt-6">
    <div className="px-4 py-5 sm:p-6">
      <h3 className="text-base font-semibold text-neutral-900">Add New Division</h3>
      <div className="flex gap-4 mt-4">
        <input
          type="text"
          placeholder="Label"
          value={newDivision.label}
          onChange={(e) =>
            setNewDivision({ ...newDivision, label: e.target.value })
          }
          className="border p-2 rounded"
        />
        <input
          type="text"
          placeholder="Division"
          value={newDivision.division}
          onChange={(e) =>
            setNewDivision({ ...newDivision, division: e.target.value })
          }
          className="border p-2 rounded"
        />
        <button
          onClick={handleAddDivision}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add
        </button>
      </div>
    </div>
  </div>
</>

    </>
  )}

{activeTab === "SchoolRevenue" && (
  <>
    <h1 className="text-2xl font-bold mb-6">School Revenue</h1>

    <div className="overflow-x-auto mt-6">
      <table className="min-w-full divide-y divide-neutral-300">
        <thead>
          <tr>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              School Name
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Year & Month
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Revenue $ (USD)
            </th>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-0">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {schoolRevenues.map((revenue) => (
            <tr key={revenue.id}>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 sm:pl-0">
                {editSchoolRevenue?.id === revenue.id ? (
                  <input
                    type="text"
                    value={editSchoolRevenue.school_name}
onChange={(e) => setEditSchoolRevenue({ ...editSchoolRevenue, school_name: e.target.value })}

                    className="border p-1 rounded"
                  />
                ) : (
                  revenue.school_name
                )}
              </td>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
                {editSchoolRevenue?.id === revenue.id ? (
                  <input
                    type="text"
                    value={editSchoolRevenue.month}
                    onChange={(e) =>
                      setEditSchoolRevenue({ ...editSchoolRevenue, month: e.target.value })
                    }
                    className="border p-1 rounded"
                  />
                ) : (
                  revenue.month
                )}
              </td>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
                {editSchoolRevenue?.id === revenue.id ? (
                  <input
                    type="number"
                    value={editSchoolRevenue.revenue}
                    onChange={(e) =>
                      setEditSchoolRevenue({ ...editSchoolRevenue, revenue: e.target.value })
                    }
                    className="border p-1 rounded"
                  />
                ) : (
                  revenue.revenue
                )}
              </td>
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-neutral-900">
                {editSchoolRevenue?.id === revenue.id ? (
                  <>
                    <button
                      onClick={() => handleEditSchoolRevenue(revenue.id, editSchoolRevenue)}
                      className="mr-4 text-green-600"
                    >
                      Save
                    </button>
                    <button onClick={stopEditingSchoolRevenue} className="text-red-600">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEditingSchoolRevenue(revenue)}
                      className="mr-4 text-blue-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSchoolRevenue(revenue.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

        <div className="bg-white shadow sm:rounded-lg mt-6">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold text-neutral-900">
          Add School Revenue
        </h3>

        <div className="flex gap-4 mt-4">
        <input
  type="text"
  placeholder="School Name"
  value={newSchoolRevenue.school_name}
  onChange={(e) =>
    setNewSchoolRevenue({ ...newSchoolRevenue, school_name: e.target.value })
  }
  className="border p-2 rounded"
/>

          <input
  type="text"
  placeholder="Date (mm/dd/yyyy)"
  value={newSchoolRevenue.month}
  onChange={(e) =>
    setNewSchoolRevenue({ ...newSchoolRevenue, month: e.target.value })
  }
  className="border p-2 rounded"
/>

          <input
            type="number"
            placeholder="Revenue $"
            value={newSchoolRevenue.revenue}
            onChange={(e) =>
              setNewSchoolRevenue({
                ...newSchoolRevenue,
                revenue: e.target.value,
              })
            }
            className="border p-2 rounded"
          />
          <button
            onClick={handleAddSchoolRevenue}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </>
)}

      {activeTab === "AnalyticsConfig" && (
        <>
          <h1 className="text-2xl font-bold mb-6">Analytics Config</h1>
          <div className="bg-white shadow sm:rounded-lg p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-600">Edit label groups and tutor hour buckets. This drives /api/analytics.</p>
              <div className="text-sm text-neutral-500">{analyticsConfigStatus}</div>
            </div>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Config JSON</label>
                <textarea
                  value={analyticsConfigText}
                  onChange={(e) => setAnalyticsConfigText(e.target.value)}
                  rows={20}
                  className="mt-1 w-full border rounded p-2 font-mono text-sm"
                />
                <div className="mt-3 flex gap-2">
                  <button onClick={saveAnalyticsConfig} className="bg-blue-600 text-white px-3 py-1.5 rounded">Save</button>
                  <button onClick={fetchAnalyticsConfig} className="bg-neutral-100 text-neutral-800 px-3 py-1.5 rounded border">Reset</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Preview</label>
                <div className="mt-1 p-3 border rounded">
                  <h3 className="font-semibold text-neutral-800">Label Groups</h3>
                  <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(analyticsConfig?.labelGroups || {}, null, 2)}</pre>
                  <h3 className="mt-4 font-semibold text-neutral-800">Tutor Buckets</h3>
                  <ul className="text-sm list-disc pl-5">
                    {(analyticsConfig?.tutorBuckets || []).map((b, i) => (
                      <li key={i}>{b.name}: {b.min}–{b.max ?? '∞'} hours</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "ReportDistribution" && (
        <>
          <h1 className="text-2xl font-bold mb-6">Reports</h1>
          <div className="bg-white shadow sm:rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Add Email to Distribution List</h2>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Report Type</label>
                <select
                  value={newReportEmail.reportType}
                  onChange={(e) => setNewReportEmail({ ...newReportEmail, reportType: e.target.value })}
                  className="w-full border rounded p-2"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newReportEmail.email}
                  onChange={(e) => setNewReportEmail({ ...newReportEmail, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full border rounded p-2"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Name (Optional)</label>
                <input
                  type="text"
                  value={newReportEmail.name}
                  onChange={(e) => setNewReportEmail({ ...newReportEmail, name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full border rounded p-2"
                />
              </div>
              <button
                onClick={handleAddReportEmail}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>

          {/* Live Preview Section */}
          <div className="bg-white shadow sm:rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Live Report Preview</h2>
            <div className="mb-4 flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Report Type</label>
                <select
                  value={previewReportType}
                  onChange={(e) => setPreviewReportType(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="weekly">Weekly Preview</option>
                  <option value="monthly">Monthly Preview</option>
                </select>
              </div>
              {previewReportType === 'weekly' ? (
                <div className="flex-1">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Select Week</label>
                  <select
                    value={previewWeekOffset}
                    onChange={(e) => setPreviewWeekOffset(parseInt(e.target.value))}
                    className="w-full border rounded p-2"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? 'Current Week' : `${i} week${i > 1 ? 's' : ''} ago`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex-1">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Select Month</label>
                  <select
                    value={previewMonthOffset}
                    onChange={(e) => setPreviewMonthOffset(parseInt(e.target.value))}
                    className="w-full border rounded p-2"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? 'Current Month' : `${i} month${i > 1 ? 's' : ''} ago`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50 max-h-[800px] overflow-y-auto">
              <ReportPreview
                reportType={previewReportType}
                weekOffset={previewWeekOffset}
                monthOffset={previewMonthOffset}
              />
            </div>
          </div>

          <div className="bg-white shadow sm:rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Test Reports</h2>
            <div className="flex gap-4">
              <button
                onClick={() => handleSendTestReport('weekly')}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Send Test Weekly Report
              </button>
              <button
                onClick={() => handleSendTestReport('monthly')}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Send Test Monthly Report
              </button>
            </div>
          </div>

          <div className="bg-white shadow sm:rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Distribution Lists</h2>
            <div className="space-y-4">
              {['weekly', 'monthly'].map((reportType) => {
                const typeLists = reportDistributionLists.filter((item) => item.report_type === reportType);
                return (
                  <div key={reportType} className="border rounded p-4">
                    <h3 className="font-semibold text-lg mb-3 capitalize">{reportType} Reports</h3>
                    {typeLists.length === 0 ? (
                      <p className="text-neutral-500 text-sm">No emails added yet</p>
                    ) : (
                      <table className="min-w-full divide-y divide-neutral-300">
                        <thead>
                          <tr>
                            <th className="py-2 text-left text-sm font-semibold text-neutral-900">Email</th>
                            <th className="py-2 text-left text-sm font-semibold text-neutral-900">Name</th>
                            <th className="py-2 text-left text-sm font-semibold text-neutral-900">Status</th>
                            <th className="py-2 text-left text-sm font-semibold text-neutral-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {typeLists.map((item) => (
                            <tr key={item.id}>
                              <td className="py-2 text-sm text-neutral-900">{item.email}</td>
                              <td className="py-2 text-sm text-neutral-500">{item.name || '—'}</td>
                              <td className="py-2">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    item.active
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-neutral-100 text-neutral-800'
                                  }`}
                                >
                                  {item.active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleToggleReportEmail(item.id)}
                                    className="text-blue-600 hover:text-blue-800 text-sm"
                                  >
                                    {item.active ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteReportEmail(item.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Report History */}
          <div className="bg-white shadow sm:rounded-lg p-6 mt-6">
            <h2 className="text-lg font-semibold mb-4">Report History</h2>
            {reportHistoryLoading ? (
              <div className="text-center py-8 text-neutral-500">Loading report history...</div>
            ) : reportHistory.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">No reports sent yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-300">
                  <thead>
                    <tr>
                      <th className="py-3 text-left text-sm font-semibold text-neutral-900">Report Type</th>
                      <th className="py-3 text-left text-sm font-semibold text-neutral-900">Period</th>
                      <th className="py-3 text-left text-sm font-semibold text-neutral-900">Recipients</th>
                      <th className="py-3 text-left text-sm font-semibold text-neutral-900">Sent At</th>
                      <th className="py-3 text-left text-sm font-semibold text-neutral-900">Status</th>
                      <th className="py-3 text-left text-sm font-semibold text-neutral-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {reportHistory.map((item) => {
                      const sentDate = new Date(item.last_sent_at || item.first_sent_at);
                      const formattedDate = sentDate.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      });
                      const periodLabel = `${new Date(item.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(item.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      
                      // Get recipients array (handle both array and string formats)
                      const recipients = Array.isArray(item.recipients) 
                        ? item.recipients 
                        : (item.recipients ? [item.recipients] : []);
                      
                      // Determine overall status (if any failed, show failed; otherwise sent)
                      const statuses = Array.isArray(item.statuses) ? item.statuses : [item.statuses || 'sent'];
                      const overallStatus = statuses.includes('failed') ? 'failed' : 
                                          statuses.includes('pending') ? 'pending' : 'sent';
                      
                      return (
                        <tr key={`${item.report_type}-${item.period_start}-${item.period_end}`}>
                          <td className="py-3 text-sm text-neutral-900 capitalize">{item.report_type}</td>
                          <td className="py-3 text-sm text-neutral-700">{periodLabel}</td>
                          <td className="py-3 text-sm text-neutral-700">
                            <div className="flex flex-col gap-1">
                              {recipients.length > 0 ? (
                                recipients.map((email, idx) => (
                                  <span key={idx} className="text-xs">{email}</span>
                                ))
                              ) : (
                                <span className="text-neutral-400">No recipients</span>
                              )}
                              {item.recipient_count > recipients.length && (
                                <span className="text-xs text-neutral-500">
                                  +{item.recipient_count - recipients.length} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-sm text-neutral-500">{formattedDate}</td>
                          <td className="py-3">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                overallStatus === 'sent'
                                  ? 'bg-green-100 text-green-800'
                                  : overallStatus === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {overallStatus}
                            </span>
                            {item.recipient_count > 1 && (
                              <span className="ml-2 text-xs text-neutral-500">
                                ({item.recipient_count} recipients)
                              </span>
                            )}
                          </td>
                          <td className="py-3">
                            <button
                              onClick={() => handleDownloadReportPDF(item)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Download PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "SyncManager" && (
        <SyncManager />
      )}

      {activeTab === "BadMarginAlerts" && (
        <BadMarginAlerts />
      )}

      {activeTab === "Images" && (
        <ImagesManager />
      )}

      {activeTab === "QRCodes" && (
        <QRCodesManager onBackToSettings={() => selectTab("Divisions")} />
      )}

      {activeTab === "InvoiceCollections" && (
        <InvoiceCollectionsSettings />
      )}

      {activeTab === "CurriculumConfig" && (
        <>
          <h1 className="text-2xl font-bold mb-6">Band Configuration</h1>
          <p className="text-sm text-neutral-500 mb-6">Edit module names, band names, and band colors used in the student management system.</p>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider w-16">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Module Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Band Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Band Color</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider w-24">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(editingCurriculum || curriculumModules).map((mod, idx) => (
                  <tr key={mod.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-500 font-medium">{mod.module_number}</td>
                    <td className="px-4 py-3">
                      {editingCurriculum ? (
                        <input
                          type="text"
                          value={editingCurriculum[idx].name}
                          onChange={(e) => updateCurriculumField(idx, 'name', e.target.value)}
                          className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="text-sm text-neutral-900">{mod.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingCurriculum ? (
                        <input
                          type="text"
                          value={editingCurriculum[idx].band_name}
                          onChange={(e) => updateCurriculumField(idx, 'band_name', e.target.value)}
                          className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="text-sm text-neutral-900">{mod.band_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingCurriculum ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editingCurriculum[idx].band_color}
                            onChange={(e) => updateCurriculumField(idx, 'band_color', e.target.value)}
                            className="h-8 w-8 rounded cursor-pointer border border-neutral-300"
                          />
                          <input
                            type="text"
                            value={editingCurriculum[idx].band_color}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                updateCurriculumField(idx, 'band_color', val);
                              }
                            }}
                            className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            maxLength={7}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded border border-neutral-200" style={{ backgroundColor: mod.band_color }} />
                          <span className="text-sm font-mono text-neutral-600">{mod.band_color}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: (editingCurriculum ? editingCurriculum[idx].band_color : mod.band_color),
                          color: ['#FACC29', '#50C8DF'].includes(editingCurriculum ? editingCurriculum[idx].band_color : mod.band_color) ? '#1a1a1a' : '#fff',
                        }}
                      >
                        {editingCurriculum ? editingCurriculum[idx].band_name : mod.band_name}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-3">
            {editingCurriculum ? (
              <>
                <button
                  onClick={handleSaveCurriculum}
                  disabled={savingCurriculum}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingCurriculum ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditingCurriculum(null)}
                  className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditingCurriculum(curriculumModules.map(m => ({ ...m })))}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Edit Configuration
              </button>
            )}
          </div>
        </>
      )}

</main>

    </div>
  );
};

export default Settings;

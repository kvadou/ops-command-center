import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate, useParams, Link } from 'react-router-dom';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  UserIcon,
  AcademicCapIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

/**
 * JobCreationPage - Matches TutorCruncher Job Creation Format
 * 
 * Follows the exact layout from TutorCruncher screenshots:
 * - Two-column layout for Job Name and Calendar Colour
 * - Rich text editor for Description
 * - Three-column layout for Charge Type, Rates
 * - Expandable "More Settings" section
 * - Expandable "Accounting Settings" section
 * - All fields with proper labels, helper text, and required indicators
 */
export default function JobCreationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams();
  
  // URL parameters - support both /clients/:clientId/jobs/create and ?client_id= format
  const clientId = params.clientId || searchParams.get('client_id');
  // Try to get student_ids from searchParams first, fallback to reading directly from URL
  const studentIdsParam = searchParams.get('student_ids') || 
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('student_ids'));
  
  // Memoize studentIds parsing to prevent recreation on every render
  const studentIds = useMemo(() => {
    if (!studentIdsParam) return [];
    return decodeURIComponent(studentIdsParam)
      .split(',')
      .map(id => {
        const trimmed = id.trim();
        // Try to parse as number first to handle negative IDs correctly, then convert back to string
        const num = parseInt(trimmed, 10);
        return isNaN(num) ? trimmed : String(num);
      })
      .filter(Boolean);
  }, [studentIdsParam]);
  
  // Debug logging
  useEffect(() => {
    console.log('JobCreationPage URL params:', {
      clientId,
      studentIdsParam,
      studentIds,
      allSearchParams: Object.fromEntries(searchParams.entries()),
      windowLocation: window.location.href,
      rawStudentIdsParam: studentIdsParam
    });
  }, [clientId, studentIdsParam, studentIds, searchParams]);
  
  // Form data - matching TutorCruncher fields
  const [formData, setFormData] = useState({
    jobName: '',
    calendarColour: '#00BCD4', // Default teal/turquoise
    description: '',
    chargeType: 'per-hour-each-student', // Default from screenshot
    defaultChargeRate: '119.00',
    defaultTutorRate: '0',
    studentPremium: '',
    requireStudent: true,
    jobInactivityTime: '',
    lessonReportsRequired: true,
    defaultTutorPermissions: 'add-edit-complete',
    reviewUnits: '5',
    cap: '',
    addedFeePerLesson: '',
    maxStudents: '',
    // Accounting Settings
    salesCodes: '',
    commissionTax: 'default-company-tax',
    autoInvoice: true,
    taxSetting: 'calculate-tax-on-amount-gross',
    tutorTax: 'default-tutor-tax',
  });
  
  // Client and student data
  const [client, setClient] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingClient, setLoadingClient] = useState(false);
  
  // Template data
  const [templates, setTemplates] = useState({ Home: [], Online: [], School: [], Club: [], Community: [] });
  const [selectedCategory, setSelectedCategory] = useState('Home');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  
  // UI state
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
  const [accountingSettingsOpen, setAccountingSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Create a stable string key from studentIds for dependency comparison
  const studentIdsKey = useMemo(() => {
    return studentIds.length > 0 ? [...studentIds].sort().join(',') : '';
  }, [studentIds]);

  // Fetch templates by category (only once on mount)
  useEffect(() => {
    setLoadingTemplates(true);
    fetch('/api/job-templates/by-category', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data.templates) {
          setTemplates(data.templates);
        }
      })
      .catch(err => console.error('Error fetching templates:', err))
      .finally(() => setLoadingTemplates(false));
  }, []); // Empty dependency array - only run once

  // Fetch client data if client_id provided
  useEffect(() => {
    if (!clientId) return;
    
    setLoadingClient(true);
    fetch(`/api/entity-details/clients/${clientId}`)
      .then(res => res.json())
      .then(data => {
        if (data.client) {
          setClient(data.client);
        }
        // Also fetch related students if we have student IDs
        if (studentIds.length > 0 && data.relatedStudents) {
          const filtered = data.relatedStudents.filter(s => {
            const recipientId = s.recipient_id || s.id || '';
            const normalizedRecipientId = String(recipientId).trim();
            const recipientIdNum = parseInt(normalizedRecipientId, 10);
            return studentIds.includes(normalizedRecipientId) ||
                   (!isNaN(recipientIdNum) && studentIds.some(id => {
                     const idNum = parseInt(String(id), 10);
                     return !isNaN(idNum) && idNum === recipientIdNum;
                   }));
          });
          setStudents(filtered);
        }
      })
      .catch(err => console.error('Error fetching client:', err))
      .finally(() => setLoadingClient(false));
  }, [clientId, studentIdsKey]); // Use stable studentIdsKey instead of array
  
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Generate job name from template and client/student data
  const generateJobName = (template, clientData, studentData) => {
    if (!template || !clientData) return '';

    const clientName = `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim();
    const category = template.category || 'Home';
    const templateName = template.name || '';
    
    // Determine lesson type from template name
    let lessonType = '1:1';
    if (templateName.includes('Sibling Split')) {
      lessonType = 'Sibling Split';
    } else if (templateName.includes('Sibling')) {
      lessonType = 'Siblings';
    } else if (templateName.includes('Group')) {
      lessonType = 'Group';
    }

    // Get student name for 1:1 lessons
    let studentName = '';
    if (lessonType === '1:1' && studentData && studentData.length > 0) {
      const firstStudent = studentData[0];
      const firstName = firstStudent.recipient_name?.split(' ')[0] || 
                       firstStudent.first_name || 
                       firstStudent.name?.split(' ')[0] || '';
      if (firstName) {
        studentName = ` (${firstName})`;
      }
    }

    // Format: Client Name – Chess – Category – Lesson Type (Student Name)
    return `${clientName} – Chess – ${category} – ${lessonType}${studentName}`;
  };

  // Build lesson brick from brick configuration
  const buildLessonBrick = (template, clientData, studentData, formData) => {
    if (!template || !template.brickLayout || !Array.isArray(template.brickLayout)) {
      return '';
    }

    const lines = [];
    const variableMappings = template.variableMappings || {};

    template.brickLayout.forEach((element) => {
      if (element.type === 'label') {
        let text = element.text || '';
        // Replace placeholders
        text = text.replace('Chess', formData.subject || 'Chess');
        if (element.bold) text = `**${text}**`;
        lines.push(text);
      } else if (element.type === 'variable') {
        const mapping = variableMappings[element.key];
        let value = '';

        if (mapping) {
          if (mapping.source === 'tutorcruncher') {
            // Get from client data
            if (element.key === 'client_name') {
              value = clientData ? `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim() : '';
            } else if (element.key === 'address') {
              value = clientData?.address || clientData?.street || '';
            }
          } else if (mapping.source === 'form') {
            value = formData[mapping.field] || '';
          }
        } else {
          // Fallback to formData
          value = formData[element.key] || '';
        }

        // Handle special cases
        if (element.key === 'children_info' && studentData && studentData.length > 0) {
          value = studentData.map(s => {
            const name = s.recipient_name || s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim();
            const age = s.age ? ` (Age: ${s.age})` : '';
            const level = s.chess_level ? ` – Chess Level: ${s.chess_level}` : '';
            return `${name}${level}${age}`;
          }).join(', ');
        } else if (element.key === 'parent_name' && clientData) {
          value = `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim();
        } else if (element.key === 'lesson_type') {
          const templateName = template.name || '';
          if (templateName.includes('Sibling Split')) {
            value = 'Sibling Split';
          } else if (templateName.includes('Sibling')) {
            value = 'Siblings';
          } else {
            value = element.default || 'Private 1:1';
          }
        }

        if (value) {
          const prefix = element.prefix || '';
          const displayValue = value || `[${element.label || element.key}]`;
          lines.push(`${prefix}${displayValue}`);
        }
      } else if (element.type === 'section') {
        const content = formData[element.content] || '';
        if (content) {
          lines.push(`\n${element.title}:`);
          lines.push(content);
        }
      }
    });

    return lines.join('\n');
  };

  // Handle template selection
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    
    if (!template) return;

    const config = template.templateConfig || {};
    const fieldConfig = template.fieldConfig || {};

    // Helper to convert color name/hex to hex code
    const convertColorToHex = (color) => {
      if (!color) return formData.calendarColour;
      if (color.startsWith('#')) return color;
      
      // Common color name mappings
      const colorMap = {
        'MediumOrchid': '#BA55D3',
        'lightgreen': '#90EE90',
        'Blue': '#2196F3',
        'Purple': '#9C27B0',
        'Teal': '#00BCD4',
        'Orange': '#FF9800',
        'Green': '#4CAF50',
        'Khaki': '#F0E68C',
        'Red': '#F44336',
        'Yellow': '#FFEB3B'
      };
      
      return colorMap[color] || `#${color}`;
    };

    // Update form data with template defaults
    const updates = {
      calendarColour: config.colour ? convertColorToHex(config.colour) : formData.calendarColour,
      chargeType: config.dft_charge_type === 'hourly' ? 'per-hour-each-student' : 
                  config.dft_charge_type === 'per-lesson' ? 'per-lesson-each-student' :
                  config.dft_charge_type === 'one-off' ? 'flat-rate' : formData.chargeType,
      defaultChargeRate: config.dft_charge_rate ? String(config.dft_charge_rate) : formData.defaultChargeRate,
      defaultTutorRate: config.dft_contractor_rate ? String(config.dft_contractor_rate) : formData.defaultTutorRate,
      studentPremium: config.sr_premium ? String(config.sr_premium) : formData.studentPremium,
      maxStudents: config.dft_max_srs ? String(config.dft_max_srs) : formData.maxStudents,
      defaultTutorPermissions: config.dft_contractor_permissions || formData.defaultTutorPermissions,
      autoInvoice: config.auto_invoice !== undefined ? config.auto_invoice : formData.autoInvoice,
      subject: fieldConfig.subject?.default || 'Chess',
      duration: fieldConfig.duration?.default || formData.duration,
    };

    // Generate job name
    if (client) {
      updates.jobName = generateJobName(template, client, students);
    }

    // Generate lesson brick
    if (template.brickEnabled && template.brickLayout) {
      const brick = buildLessonBrick(template, client, students, { ...formData, ...updates });
      if (brick) {
        updates.description = brick;
      }
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.jobName.trim()) {
      toast.error('Job Name is required');
      return;
    }
    
    if (!formData.defaultChargeRate || !formData.defaultTutorRate) {
      toast.error('Default Charge Rate and Default Tutor Rate are required');
      return;
    }
    
    setSaving(true);
    try {
      // Map form data to service creation format
      const servicePayload = {
        name: formData.jobName,
        description: formData.description,
        colour: formData.calendarColour,
        dft_charge_type: formData.chargeType === 'per-hour-each-student' ? 'hourly' : 
                        formData.chargeType === 'per-lesson-each-student' ? 'per-lesson' :
                        formData.chargeType === 'flat-rate' ? 'one-off' : 'hourly',
        dft_charge_rate: parseFloat(formData.defaultChargeRate) || 0,
        dft_contractor_rate: parseFloat(formData.defaultTutorRate) || 0,
        sr_premium: formData.studentPremium ? parseFloat(formData.studentPremium) : null,
        dft_max_srs: formData.maxStudents ? parseInt(formData.maxStudents) : null,
        dft_contractor_permissions: formData.defaultTutorPermissions || 'add-edit-complete',
        require_sr: formData.requireStudent,
        require_con: true, // Require Tutor
        review_units: formData.reviewUnits ? parseInt(formData.reviewUnits) : null,
        cap: formData.cap ? parseFloat(formData.cap) : null,
        added_fee_per_lesson: formData.addedFeePerLesson ? parseFloat(formData.addedFeePerLesson) : null,
        job_inactivity_time: formData.jobInactivityTime ? parseInt(formData.jobInactivityTime) : null,
        lesson_reports_required: formData.lessonReportsRequired,
        auto_invoice: formData.autoInvoice,
        sales_codes: formData.salesCodes || null,
        commission_tax: formData.commissionTax || null,
        tax_setting: formData.taxSetting || null,
        tutor_tax: formData.tutorTax || null,
        client_id: clientId || null,
        student_ids: studentIds.length > 0 ? studentIds : null,
        localOnly: true, // Set to true for local testing (won't create in TutorCruncher)
      };
      
      // Create service via services API
      const response = await fetch('/api/services', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(servicePayload)
      });
      
      if (response.ok) {
        const data = await response.json();
        const serviceId = data.service?.id || data.service_id || data.id;
        
        // If we have client_id and student_ids, associate them with the job
        if (serviceId && (clientId || studentIds.length > 0)) {
          try {
            await fetch('/api/jobs/associate', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                service_id: serviceId,
                client_id: clientId,
                student_ids: studentIds.length > 0 ? studentIds : null
              })
            });
          } catch (assocError) {
            console.error('Error associating job with client/students:', assocError);
            // Don't fail the whole operation if association fails
          }
        }
        
        if (serviceId) {
          // Navigate to job detail page, or back to client if we came from client page
          if (clientId) {
            navigate(`/clients/${clientId}?job_created=${serviceId}`);
          } else {
            navigate(`/jobs/${serviceId}`);
          }
        } else {
          navigate('/jobs');
        }
      } else {
        const error = await response.json();
        toast.error(`Error creating job: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating job:', error);
      toast.error('Failed to create job. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
        {/* Association Banner */}
        {(client || students.length > 0) && (
          <div className="bg-brand-purple/10 border border-brand-purple/20 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <LinkIcon className="h-5 w-5 text-brand-purple mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-brand-purple mb-2">
                  This job will be automatically associated with:
                </h3>
                <div className="space-y-2">
                  {client && (
                    <div className="flex items-center gap-2 text-sm text-neutral-700">
                      <UserIcon className="h-4 w-4 text-brand-purple" />
                      <span className="font-medium">Client:</span>
                      <Link 
                        to={`/clients/${client.client_id}`}
                        className="text-brand-purple hover:text-brand-navy hover:underline"
                      >
                        {client.first_name} {client.last_name}
                      </Link>
                    </div>
                  )}
                  {(students.length > 0 || studentIds.length > 0) && (
                    <div className="flex items-start gap-2 text-sm text-neutral-700">
                      <AcademicCapIcon className="h-4 w-4 text-brand-purple mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="font-medium">Students ({students.length || studentIds.length}):</span>
                        <div className="mt-1 flex flex-wrap gap-2 items-center">
                          {students.length > 0 ? (
                            // Show full student details if available
                            students.map((student, idx) => {
                              // Try multiple possible field names for student name
                              const studentName = student.recipient_name || 
                                                student.name || 
                                                student.first_name || 
                                                (student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : null) ||
                                                'Unknown Student';
                              const studentId = student.recipient_id || student.id;
                              return (
                                <React.Fragment key={studentId || idx}>
                                  {studentId ? (
                                    <Link
                                      to={`/students/${studentId}`}
                                      className="text-brand-purple hover:text-brand-navy hover:underline font-medium"
                                    >
                                      {studentName}
                                    </Link>
                                  ) : (
                                    <span className="text-brand-purple font-medium">{studentName}</span>
                                  )}
                                  {idx < students.length - 1 && <span className="text-neutral-500 ml-1">,</span>}
                                </React.Fragment>
                              );
                            })
                          ) : (
                            // Fallback: show student IDs if details aren't available yet
                            studentIds.map((id, idx) => (
                              <React.Fragment key={id || idx}>
                                <span className="text-brand-purple font-medium">Student {id}</span>
                                {idx < studentIds.length - 1 && <span className="text-neutral-500 ml-1">,</span>}
                              </React.Fragment>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-600 mt-3">
                  The job will be linked to this client and these students automatically upon creation.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h1 className="text-2xl font-semibold text-neutral-900 mb-6">Add Job</h1>
          
          {/* Template Selection */}
          <div className="mb-6 pb-6 border-b border-neutral-200">
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              Select Template <span className="text-neutral-500 font-normal">(optional)</span>
            </label>
            
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['Home', 'Online', 'School', 'Club', 'Community'].map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(category);
                    setSelectedTemplate(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? 'bg-brand-purple text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Template List */}
            {loadingTemplates ? (
              <div className="text-sm text-neutral-500">Loading templates...</div>
            ) : templates[selectedCategory] && templates[selectedCategory].length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates[selectedCategory].map(template => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      selectedTemplate?.id === template.id
                        ? 'border-brand-purple bg-brand-purple/5'
                        : 'border-neutral-200 hover:border-brand-purple/50 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="font-medium text-neutral-900 mb-1">{template.name}</div>
                    {template.description && (
                      <div className="text-xs text-neutral-600 line-clamp-2">{template.description}</div>
                    )}
                    {selectedTemplate?.id === template.id && (
                      <div className="text-xs text-brand-purple font-medium mt-2">✓ Selected</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">No templates available for {selectedCategory}</div>
            )}

            {selectedTemplate && (
              <div className="mt-4 p-3 bg-brand-purple/10 border border-brand-purple/20 rounded-lg">
                <div className="text-sm font-medium text-brand-purple mb-1">
                  Template: {selectedTemplate.name}
                </div>
                <div className="text-xs text-neutral-600">
                  Form fields and job name will be pre-populated. You can modify them below.
                </div>
              </div>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Top Row - Job Name and Calendar Colour */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Job Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.jobName}
                  onChange={(e) => handleInputChange('jobName', e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                  placeholder="Brief title for the Job"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Brief title for the Job visible to all Users involved.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Calendar Colour <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div 
                    className="h-10 w-10 border border-neutral-300 rounded cursor-pointer flex-shrink-0"
                    style={{ backgroundColor: formData.calendarColour }}
                    onClick={() => document.getElementById('colorPicker')?.click()}
                  />
                  <input
                    id="colorPicker"
                    type="color"
                    value={formData.calendarColour}
                    onChange={(e) => handleInputChange('calendarColour', e.target.value)}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
            
            {/* Description - Rich Text Editor Style */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                placeholder="Concise description of the Job to be shown to Tutors and Administrators."
              />
              <p className="mt-1 text-xs text-neutral-500">
                Concise description of the Job to be shown to Tutors and Administrators.
              </p>
            </div>
            
            {/* Charge Type and Rates - Three Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Charge Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.chargeType}
                  onChange={(e) => handleInputChange('chargeType', e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                >
                  <option value="per-hour-each-student">Per hour, for each student</option>
                  <option value="per-lesson-each-student">Per lesson, for each student</option>
                  <option value="flat-rate">Flat rate</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  The charge type allows you to set the default unit in which lessons are charged. This can be per hour or per lesson, but you can also decide whether to issue charges to each student, or assign a general flat rate that would be split equally depending on how many students have been assigned.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Default Charge Rate <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.defaultChargeRate}
                  onChange={(e) => handleInputChange('defaultChargeRate', e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                  placeholder="119.00"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  The amount the Student's paying Client will be charged per hour or lesson. Not sure how much you should be charging? Try our{' '}
                  <a href="#" className="text-blue-600 hover:underline">tutoring rates calculator</a> to see what the average rates are.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Default Tutor Rate <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.defaultTutorRate}
                  onChange={(e) => handleInputChange('defaultTutorRate', e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  The amount the Tutor will be paid per hour or lesson. Not sure how much you should be charging? Try our{' '}
                  <a href="#" className="text-blue-600 hover:underline">tutoring rates calculator</a> to see what the average rates are.
                </p>
              </div>
            </div>
            
            {/* More Settings - Expandable */}
            <div>
              <button
                type="button"
                onClick={() => setMoreSettingsOpen(!moreSettingsOpen)}
                className="flex items-center gap-2 text-sm font-medium text-brand-purple hover:text-brand-navy mb-2"
              >
                {moreSettingsOpen ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
                More Settings
                <span className="text-neutral-500 font-normal ml-1">Click to view more options</span>
              </button>
              
              {moreSettingsOpen && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6 pl-6 border-l-2 border-neutral-200">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Student Premium
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.studentPremium}
                      onChange={(e) => handleInputChange('studentPremium', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      An extra amount paid to each Tutor per Student per unit (eg. hour).
                    </p>
                  </div>
                  
                  <div>
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="requireStudent"
                        checked={formData.requireStudent}
                        onChange={(e) => handleInputChange('requireStudent', e.target.checked)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mt-1"
                      />
                      <div className="ml-2 flex-1">
                        <label htmlFor="requireStudent" className="block text-sm font-medium text-neutral-700">
                          Require Student
                        </label>
                        <p className="mt-1 text-xs text-neutral-500">
                          Require Student to be attached before Lesson can be completed
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Job Inactivity Time
                    </label>
                    <input
                      type="number"
                      value={formData.jobInactivityTime}
                      onChange={(e) => handleInputChange('jobInactivityTime', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                      placeholder="Days"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Time (in days) of inactivity on the Job before it is marked as 'Gone Cold'
                    </p>
                  </div>
                  
                  <div>
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="lessonReportsRequired"
                        checked={formData.lessonReportsRequired}
                        onChange={(e) => handleInputChange('lessonReportsRequired', e.target.checked)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mt-1"
                      />
                      <div className="ml-2 flex-1">
                        <label htmlFor="lessonReportsRequired" className="block text-sm font-medium text-neutral-700">
                          Lesson Reports Required
                        </label>
                        <p className="mt-1 text-xs text-neutral-500">
                          Prevents Lessons being marked as complete until they have a Report. Turned on automatically if auto invoice is enabled (see accounting settings).
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Default Tutor Permissions
                    </label>
                    <select
                      value={formData.defaultTutorPermissions}
                      onChange={(e) => handleInputChange('defaultTutorPermissions', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    >
                      <option value="add-edit-complete">Tutor can add and edit Lessons</option>
                      <option value="add-edit">Tutor can add and edit Lessons (no complete)</option>
                      <option value="view-only">View only</option>
                    </select>
                  </div>
                  
                  <div>
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="requireTutor"
                        checked={true}
                        disabled
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mt-1"
                      />
                      <div className="ml-2 flex-1">
                        <label htmlFor="requireTutor" className="block text-sm font-medium text-neutral-700">
                          Require Tutor
                        </label>
                        <p className="mt-1 text-xs text-neutral-500">
                          Require Tutor to be attached before Lesson can be completed
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Review Units
                    </label>
                    <input
                      type="number"
                      value={formData.reviewUnits}
                      onChange={(e) => handleInputChange('reviewUnits', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                      placeholder="5"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      The amount of hours before an automatic review request is sent. The default is 5
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Cap
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.cap}
                      onChange={(e) => handleInputChange('cap', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                      placeholder="Maximum units"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Maximum number of units, see Charge Type
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Added fee per Lesson
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.addedFeePerLesson}
                      onChange={(e) => handleInputChange('addedFeePerLesson', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      A fixed amount that will be added for each completed Lesson
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Max Students
                    </label>
                    <input
                      type="number"
                      value={formData.maxStudents}
                      onChange={(e) => handleInputChange('maxStudents', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                      placeholder="No maximum"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Maximum Students on a lesson, can be overridden on each Lesson leave blank for no maximum
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Accounting Settings - Expandable */}
            <div>
              <button
                type="button"
                onClick={() => setAccountingSettingsOpen(!accountingSettingsOpen)}
                className="flex items-center gap-2 text-sm font-medium text-brand-purple hover:text-brand-navy mb-2"
              >
                {accountingSettingsOpen ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
                Accounting Settings
                <span className="text-neutral-500 font-normal ml-1">Click to view more options</span>
              </button>
              
              {accountingSettingsOpen && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6 pl-6 border-l-2 border-neutral-200">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Sales Codes
                    </label>
                    <select
                      value={formData.salesCodes}
                      onChange={(e) => handleInputChange('salesCodes', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    >
                      <option value="">---------</option>
                      {/* Add actual sales codes from API if available */}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Leave blank to use Branch default
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Tax Setting
                    </label>
                    <select
                      value={formData.taxSetting}
                      onChange={(e) => handleInputChange('taxSetting', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    >
                      <option value="calculate-tax-on-amount-gross">Calculate tax on amount (enter GROSS values)</option>
                      <option value="calculate-tax-on-amount-net">Calculate tax on amount (enter NET values)</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Net or Gross
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Commission Tax
                    </label>
                    <select
                      value={formData.commissionTax}
                      onChange={(e) => handleInputChange('commissionTax', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    >
                      <option value="default-company-tax">Default Company Tax (no tax)</option>
                      {/* Add actual tax options from API if available */}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Leave blank to use Branch default
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Tutor Tax
                    </label>
                    <select
                      value={formData.tutorTax}
                      onChange={(e) => handleInputChange('tutorTax', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                    >
                      <option value="default-tutor-tax">Default Tutor Tax (no tax)</option>
                      {/* Add actual tax options from API if available */}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Leave blank to use Branch default, will be overridden by Tutor tax setup
                    </p>
                  </div>
                  
                  <div>
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="autoInvoice"
                        checked={formData.autoInvoice}
                        onChange={(e) => handleInputChange('autoInvoice', e.target.checked)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mt-1"
                      />
                      <div className="ml-2 flex-1">
                        <label htmlFor="autoInvoice" className="block text-sm font-medium text-neutral-700">
                          Auto Invoice
                        </label>
                        <p className="mt-1 text-xs text-neutral-500">
                          If checked, invoices and reports will be sent immediately after a lesson is marked complete. This overrides the lesson reports required setting.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Submit Button - Left aligned */}
            <div className="flex justify-start pt-6 border-t border-neutral-200">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}

import React, { useState, useEffect } from "react";
import { useRef } from "react";

import "react-datepicker/dist/react-datepicker.css";
import "react-phone-number-input/style.css";

import { Box, TextField, Autocomplete, Chip } from "@mui/material";
import { DateTime } from "luxon";
import { InformationCircleIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

import { useLocation } from "react-router-dom";

const studentTypeOptions = [
  "One Student",
  "Two Students",
  "Small Group (3+ Students)",
];

const daysOfWeek = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const generateTimeSlots = () => {
  const times = [];
  const startHour = 8;
  const endHour = 20;
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hour12 = h % 12 || 12;
      const amPm = h < 12 ? "AM" : "PM";
      const formattedTime = `${String(hour12).padStart(2, "0")}:${String(
        m
      ).padStart(2, "0")} ${amPm}`;
      times.push(formattedTime);
    }
  }
  return times;
};

export default function BookingFormsInternal() {
  const sigPadRef = useRef(null);
const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
const [serviceUrl, setServiceUrl] = useState("");
 const [isLoading, setIsLoading] = useState(false);
  const [teachingNotes, setTeachingNotes] = useState("");
  const [logisticalNotes, setLogisticalNotes] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentOptions, setStudentOptions] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentDetails, setStudentDetails] = useState([]);
  const [schoolName, setSchoolName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [seasonYear, setSeasonYear] = useState("");
  const [duration, setDuration] = useState("");
  const [lessonDates, setLessonDates] = useState("");

  const [dftChargeRate, setDftChargeRate] = useState("");
  const [dftContractorRate, setDftContractorRate] = useState("");
  const [dftChargeType, setDftChargeType] = useState("");

  const { search } = useLocation();
  const [sessionError, setSessionError] = useState("");
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentLastName, setParentLastName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [bookingTypes, setBookingTypes] = useState([]);
  const [bookingType, setBookingType] = useState("");
  const [price, setPrice] = useState(0);

  const params = new URLSearchParams(search);
  const preselectServiceId = params.get("serviceId");
  const preselectBookingTypeId = params.get("bookingTypeId");

  useEffect(() => {
    const selected = bookingTypes.find((bt) => bt.name === bookingType) || {};
    // these keys must match whatever your API returns
    setDftChargeRate(selected.dftChargeRate?.toString() ?? "");
    setDftContractorRate(selected.dftContractorRate?.toString() ?? "");
    setDftChargeType(selected.dftChargeType ?? "");
  }, [bookingType, bookingTypes]);

  useEffect(() => {
    if (studentQuery.length < 3) {
      setStudentOptions([]);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(
        `/api/tutorcruncher/students?search=${encodeURIComponent(studentQuery)}`
      )
        .then((r) => r.json())
        .then((data) => setStudentOptions(data.students || []))
        .catch(() => setStudentOptions([]));
    }, 300);

    return () => clearTimeout(timeout);
  }, [studentQuery]);

  const defaultDate = DateTime.now().plus({ weeks: 1 }).toISODate();

  useEffect(() => {
    fetch("/api/booking-types")
      .then((r) => r.json())
      .then((data) => {
        const types = Array.isArray(data) ? data : data.rows || [];
        const normalized = types.map((t) => ({
          ...t,
          image: t.image_url,
          lessonType: t.lessonType ?? t.lesson_type,
          serviceId: t.serviceId ?? t.service_id,
        }));
        setBookingTypes(normalized);

     // only auto‑select if you actually passed in a serviceId or bookingTypeId
     if (normalized.length && (preselectServiceId || preselectBookingTypeId)) {
       const match =
         (preselectServiceId &&
           normalized.find((bt) => String(bt.serviceId) === preselectServiceId)) ||
         (preselectBookingTypeId &&
           normalized.find((bt) => String(bt.id) === preselectBookingTypeId));
       if (match) {
         setBookingType(match.name);
         setPrice(match.actualPrice);
       }
     }
    })
    .catch(console.error);
}, []);

  const studentTemplate = {
    first: "",
    last: "",
    school: "",
    experience: "Brand New (Never played before)",
    dob: "",
    notes: "",
  };
  const [students, setStudents] = useState([{ ...studentTemplate }]);
  const [studentType, setStudentType] = useState(studentTypeOptions[0]);

  const [slots, setSlots] = useState([
    { date: "", dayOfWeek: "-", start: "-", end: "-" },
    { date: "", dayOfWeek: "-", start: "-", end: "-" },
    { date: "", dayOfWeek: "-", start: "-", end: "-" },
  ]);

  const timeSlots = generateTimeSlots();

  const handleSlotChange = (index, field, value) => {
    const updatedSlots = [...slots];
    updatedSlots[index] = { ...updatedSlots[index], [field]: value };
    setSlots(updatedSlots);
  };

  const renderTimeSlots = () => {
    // Determine if only one slot and only start time is needed
    const singleSlotMode =
      bookingType === "School" || bookingType.includes("Club");
    const slotsToRender = singleSlotMode ? [slots[0]] : slots;

    return slotsToRender.map((slot, index) => (
      <div key={index} className="p-4 border rounded-md space-y-4 mb-4">
        <label className="block text-sm font-medium text-neutral-700">
          {index === 0 ? "Day of the Week (Required)" : "Day of the Week"}
        </label>
        <select
          value={slot.dayOfWeek}
          onChange={(e) => handleSlotChange(index, "dayOfWeek", e.target.value)}
          className="mt-1 block w-full border-neutral-300 rounded-md"
          required
        >
          <option value="-">Please Select</option>
          {daysOfWeek.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700">
              Start Time
            </label>
            <select
              value={slot.start}
              onChange={(e) => handleSlotChange(index, "start", e.target.value)}
              className="mt-1 block w-full border-neutral-300 rounded-md"
              required
            >
              <option value="-">Please Select</option>
              {timeSlots.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          {/* Only show End Time selector if not in single-slot mode */}
          {!singleSlotMode && (
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-700">
                End Time
              </label>
              <select
                value={slot.end}
                onChange={(e) => handleSlotChange(index, "end", e.target.value)}
                className="mt-1 block w-full border-neutral-300 rounded-md"
                required
              >
                <option value="-">Please Select</option>
                {getAvailableEndTimes(slot.start).map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    ));
  };

  useEffect(() => {
    if (!selectedStudents.length) {
      setStudentDetails([]);
      return;
    }

    Promise.all(
      selectedStudents.map((stu) =>
        fetch(`/api/tutorcruncher/students/${stu.id}`)
          .then((r) => r.json())
          .then((data) => {
            // extra_attrs has your "sr_dob" field
            const dobField = data.extra_attrs.find(
              (a) => a.machine_name === "sr_dob"
            );
            const dob = dobField?.value;
            return {
              id: data.id,
              firstName: data.first_name,
              lastName: data.last_name,
              dob,
              age: getAge(dob),
              payingClient: data.paying_client, // contains id, first_name, last_name, email…
            };
          })
      )
    ).then(setStudentDetails);
  }, [selectedStudents]);

  const getAvailableEndTimes = (startTime) => {
    const startIndex = timeSlots.indexOf(startTime);
    const availableEndTimes = timeSlots.slice(startIndex + 4);
    return availableEndTimes;
  };

  const getAge = (dob) =>
    dob
      ? Math.floor(
          (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365)
        )
      : "";

  let jobName;
  const lines = [];

  if (bookingType === "School" || bookingType.includes("Club")) {
    // School or Club-specific block
    const isClub = bookingType.includes("Club");
    // Only include seasonYear for schools, not for clubs
    const seasonSegment = isClub ? "" : ` // ${seasonYear}`;
    jobName = `${schoolName} // Chess${seasonSegment} // ${slots[0]?.dayOfWeek} ${slots[0]?.start}`;
    lines.push(`**${jobName}**`);
    lines.push(`* Lesson Details - Chess`);
    lines.push(`* Duration: ${duration} Minutes`);
    lines.push(`* Lesson Type: 60 minute, 45 minute`);
    if (!isClub) {
      lines.push(`* Contact: ${parentFirstName} ${parentLastName}`);
    }
    lines.push(`* Age Group: ${ageGroup}`);
    lines.push(`* **Day and Time:** ${slots[0]?.dayOfWeek} ${slots[0]?.start}`);
    lines.push(`* Start Date: ${slots[0]?.date}`);
    if (!isClub) {
      lines.push(`* School Lesson Dates: ${lessonDates}`);
    }
    lines.push(`* Logistical Notes: ${logisticalNotes || "Test"}`);
    lines.push(`* Teaching Notes: ${teachingNotes || "Test"}`);
  } else {
    // Existing private lesson logic preserved as-is
    const ratioMap = {
      "One Student": "1:1",
      "Two Students": "1:2",
      "Small Group (3+ Students)": "1:3",
    };
    const ratio = ratioMap[studentType] || "—";
    const firstClient = studentDetails[0]?.payingClient;
    const clientName = firstClient
      ? `${firstClient.first_name} ${firstClient.last_name}`
      : `${parentFirstName} ${parentLastName}`;
    const firstStudentName = studentDetails[0]?.firstName || "";
    const parentName = studentDetails[0]?.payingClient
      ? `${studentDetails[0].payingClient.first_name} ${studentDetails[0].payingClient.last_name}`
      : `${parentFirstName} ${parentLastName}`;

    jobName =
      [
        clientName,
        "Chess",
        bookingTypes.find((b) => b.name === bookingType)?.lessonType || "",
        ratio,
      ]
        .filter(Boolean)
        .join(" – ") + (firstStudentName ? ` (${firstStudentName})` : "");

    lines.push(`**${parentName}**`);
    lines.push(`**${bookingType} – Lesson Details – Chess**`);
    lines.push("* Duration: 45–60 Minutes");
    lines.push(`* Lesson Type: Private ${ratio}`);
    lines.push(`* Parent: ${parentName}`);
   lines.push(`* Children:`);
studentDetails.forEach((st) => {
  lines.push(`  * ${st.firstName} ${st.lastName} – (Age: ${st.age})`);
});

// now “Day & Time” at the same level:
lines.push(`* **Day & Time (pick one):**`);

slots.forEach((s) => {
  if (s.dayOfWeek && s.start && s.end) {
    lines.push(`  * ${s.dayOfWeek}: ${s.start} – ${s.end}`);
  }
});
    const fmt = (d) =>
      new Date(d).toLocaleDateString(undefined, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    if (slots[0]?.date) {
      lines.push(`* Start Date: ${fmt(slots[0].date)}`);
    }
    lines.push("* Lesson dates: Weekly Ongoing Post Trial");
    lines.push(`* Teaching Notes: ${teachingNotes || "None"}`);
    lines.push(`* Logistical Notes: ${logisticalNotes || "None"}`);
  }

  const jobDesc = lines.join("\n");


  // ① Build and POST the payload when the form is submitted
  const handleSubmit = async (e) => {
    e.preventDefault();
 setIsLoading(true);
   setServiceUrl("");
    // pull together exactly what the backend needs
    const payload = {
      jobName,
      jobDesc,
     dftChargeRate: Number(dftChargeRate),
   dftContractorRate: Number(dftContractorRate),
    //   colour,
      bookingType,
      students: selectedStudents.map((s) => s.id),
      labelId: bookingTypes.find((b) => b.name === bookingType)?.labelId,
    };

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);

       const { serviceId } = await res.json();
    // build the full link to show the user
     const url = `https://account.acmeops.com/cal/service/${serviceId}/`;
     setServiceUrl(url);
      setSubmitted(true);
     setErrors({});
    } catch (err) {
      console.error("Submit failed:", err);
      setErrors({ submit: err.message });
    } finally {
     setIsLoading(false);
    }
  };

// helper to clear everything
 const handleAddAnother = () => {
   setSubmitted(false);
   setServiceUrl("");
   setErrors({});
   setBookingType("");
   setSelectedStudents([]);
   setStudentDetails([]);
   setTeachingNotes("");
   setLogisticalNotes("");
   setSlots([
     { date: "", dayOfWeek: "-", start: "-", end: "-" },
     { date: "", dayOfWeek: "-", start: "-", end: "-" },
     { date: "", dayOfWeek: "-", start: "-", end: "-" },
   ]);
   // …and reset any other bits you want blank…
 };

  return (
  
      <div className="relative z-10 w-full bg-white shadow-lg rounded-lg overflow-hidden md:flex">
 
        {/* ── Left Column: Form ── */}
        <div className="w-full md:w-2/3 p-6 overflow-auto">
        {!submitted ? (
<form onSubmit={handleSubmit} className="space-y-6">
        

            {errors.bookingType && (
              <p className="text-sm text-red-600 mt-1">{errors.bookingType}</p>
            )}
           
              <label
                htmlFor="bookingType"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Select a Job Template
              </label>
              <select
                id="bookingType"
                value={bookingType || ""}
                onChange={(e) => {
                  const selectedType = e.target.value;
                  setBookingType(selectedType);
                  const selected = bookingTypes.find(
                    (bt) => bt.name === selectedType
                  );
                  setPrice(selected?.actualPrice || 0);
                }}
                className="block w-full border border-neutral-300 rounded-md shadow-sm p-3 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="" disabled>
                  -- Please select --
                </option>
                {bookingTypes
                  .filter((bt) => bt.lessonType !== "Club")
                  .map((bt) => (
                    <option key={bt.name} value={bt.name}>
                      {bt.name}
                    </option>
                  ))}
              </select>

               {/* ── everything below will only show once bookingType is non-empty ── */}
    {bookingType && (
      <>

              {(bookingType === "School" || bookingType.includes("Club")) && (
                <Box
                  mt={2}
                  mb={2}
                  display="flex"
                  flexDirection="row"
                  flexWrap="wrap"
                  gap={2}
                >
                  <TextField
                    label="School/Club Name"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    variant="outlined"
                    sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                  />
                  <TextField
                    label="Age Group"
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                    variant="outlined"
                    sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                  />
                </Box>
              )}

              {bookingType === "School" && (
                <Box
                  mt={2}
                  mb={2}
                  display="flex"
                  flexDirection="row"
                  flexWrap="wrap"
                  gap={2}
                >
                  <TextField
                    label="Season / Year"
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    variant="outlined"
                    sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                  />
                  <TextField
                    label="School Lesson Dates"
                    value={lessonDates}
                    onChange={(e) => setLessonDates(e.target.value)}
                    variant="outlined"
                    sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                  />
                  <TextField
                    label="Duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    variant="outlined"
                    sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                  />
                </Box>
              )}

              <Box
                mt={2}
                mb={2}
                display="flex"
                flexDirection="row"
                flexWrap="wrap"
                gap={2}
              >
                {/* New numeric inputs */}
                <TextField
                  label="Charge Rate"
                  type="number"
                  value={dftChargeRate}
                  onChange={(e) => setDftChargeRate(e.target.value)}
                  variant="outlined"
                  sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                />
                <TextField
                  label="Tutor Rate"
                  type="number"
                  value={dftContractorRate}
                  onChange={(e) => setDftContractorRate(e.target.value)}
                  variant="outlined"
                  sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                />
                <TextField
                  label="Charge Type"
                  type="text"
                  value={dftChargeType}
                  onChange={(e) => setDftChargeType(e.target.value)}
                  variant="outlined"
                  sx={{ flex: "1 1 calc(33% - 16px)", minWidth: 200 }}
                />
              </Box>
         

            <div className="space-y-6">
              {/* //Select Students */}
              <Autocomplete
                multiple
                options={studentOptions}
                getOptionLabel={(opt) => `${opt.firstName} ${opt.lastName}`}
                filterSelectedOptions
                onInputChange={(e, v) => setStudentQuery(v)}
                onChange={(e, newVal) => setSelectedStudents(newVal)}
                value={selectedStudents}
                noOptionsText="Type at least 3 letters…"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search students"
                    placeholder="Type a name…"
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((opt, i) => (
                    <Chip
                      key={opt.id}
                      label={`${opt.firstName} ${opt.lastName}`}
                      {...getTagProps({ i })}
                    />
                  ))
                }
              />
            </div>

            {/*  ── here’s where we show each student’s detailed info */}
            {studentDetails.length > 0 && (
              <div className="mt-6 p-4 border rounded bg-neutral-50">
                <h3 className="text-lg font-semibold mb-2">
                  Selected Students
                </h3>
                {studentDetails.map((st) => (
                  <div key={st.id} className="mb-4 p-2 border rounded">
                    <p>
                      <strong>Name:</strong> {st.firstName} {st.lastName}
                    </p>
                    <p>
                      <strong>DOB:</strong> {st.dob || "n/a"}{" "}
                      <em>({st.age || "–"} yrs)</em>
                    </p>
                    {st.payingClient && (
                      <p>
                        <strong>Paying Client:</strong>{" "}
                        {st.payingClient.first_name} {st.payingClient.last_name}{" "}
                        ({st.payingClient.email || "no email"})
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <TextField
              label="Teaching Notes"
              value={teachingNotes}
              onChange={(e) => setTeachingNotes(e.target.value)}
              multiline
              fullWidth
              variant="outlined"
            />
            <TextField
              label="Logistical Notes"
              value={logisticalNotes}
              onChange={(e) => setLogisticalNotes(e.target.value)}
              multiline
              fullWidth
              variant="outlined"
            />

            <div className="space-y-6">
              <p className="text-lg font-medium text-neutral-900">
                Date & Time Preferences
              </p>

              <div className="p-4 border rounded-md">
                <label className="block text-sm font-medium text-neutral-700">
                  Preferred start date
                </label>
                <input
                  type="date"
                  value={slots[0].date}
                  min={defaultDate}
                  onChange={(e) => handleSlotChange(0, "date", e.target.value)}
                  className={`mt-1 block w-full  ${
                    sessionError ? "border-red-500" : "border-neutral-300"
                  }`}
                />
              </div>

              <div className="space-y-4">{renderTimeSlots()}</div>

             
            </div>
             </>
    )}

          {/* only show submit & link once a bookingType is selected */}
          {bookingType && (
            <>
              {errors.submit && (
                <p className="text-sm text-red-600">{errors.submit}</p>
              )}
              <button
                type="submit"
                className={`w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition
                  ${isLoading ? "bg-neutral-400" : "bg-blue-600 hover:bg-blue-700"}`}
                disabled={isLoading}
              >
                {isLoading ? "Creating…" : "Create Job on TutorCruncher"}
              </button>

              {serviceUrl && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
                   Job created on TutorCruncher!{" "}
                  <a
                    href={serviceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    View it here
                  </a>
                </div>
              )}
            </>
          )}

          </form>
          ) : (
       <div className="flex flex-col items-center justify-center space-y-6 p-8 bg-white rounded-2xl shadow-lg max-w-md mx-auto">
  {/* icon container with pulse */}
  <div className="p-4 bg-green-100 rounded-full">
    <CheckCircleIcon className="h-8 w-8 text-green-600" />
  </div>


  <h1 className="text-3xl font-bold leading-tight text-green-700 text-center">
Job successfully created on TutorCruncher!
  </h1>

  {serviceUrl && (
    <a
      href={serviceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block px-5 py-2 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition"
    >
      View it here
    </a>
  )}

  <button
    onClick={handleAddAnother}
    className="mt-4 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition"
  >
    Add Another
  </button>
</div>
       )}
        </div>
    
        {/* ── Right Column: Sticky Preview ── */}
       <div className="hidden md:block md:w-1/3 p-6 border-l overflow-auto sticky top-4 h-[calc(100vh-2rem)]">
  <h2 className="text-xl font-semibold mb-4">Brick Preview</h2>

  {bookingType ? (
    <>
      <p className="mb-2">
        <strong>Job Name:</strong> {jobName}
      </p>
      <pre className="whitespace-pre-wrap bg-neutral-50 p-4 rounded text-sm">
        {jobDesc}
      </pre>
    </>
  ) : (
<div className="flex flex-col items-center justify-center text-neutral-400">
          <InformationCircleIcon className="h-8 w-8 mb-4 mt-4" />
      <p className="text-lg font-medium">
        Please select a booking type first
      </p>
    </div>
  )}
</div>
      </div>
    
  );
}

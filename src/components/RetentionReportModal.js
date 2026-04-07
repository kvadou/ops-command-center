import React, { useRef, useState, useEffect } from "react";
import { useToast } from "../hooks/useToast";

import {
  Modal,
  Paper,
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Button,
  Stack,
  Chip,
} from "@mui/material";

import { XMarkIcon } from '@heroicons/react/24/outline';
import dayjs from "dayjs";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import EmailModal from "./EmailModal";

const emailSignatures = {
  Jessica: `<img src="https://i.imgur.com/WNQUlmV.jpeg" alt="Footer Image" style="width: 70%; height: auto; display: block; margin: 0 auto;" />`,
  Caitlin: `<img src="https://i.imgur.com/GYEU1tf.jpeg" alt="New Footer Image" style="width: 70%; height: auto; display: block; margin: 0 auto;" />`,
};

const RetentionReportModal = ({
  open,
  onClose,
  reportData = {},
  tutorId,
  tutorData = [],
  loading = false,
  excludedTutors = [],
}) => {
  const isExcluded =
    excludedTutors.includes(String(tutorId)) ||
    excludedTutors.includes(Number(tutorId));

  const toast = useToast();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [selectedSignature, setSelectedSignature] = useState("Jessica");

  const handleEmailReport = async (
    email,
    subject,
    message,
    selectedSignature
  ) => {
    if (!email) {
      toast.error("Email is required.");
      return;
    }
    console.log("Selected Signature:", selectedSignature);

    const generateSvgChart = (percentage, color) => {
      const circumference = 36 * Math.PI;
      const progress = (percentage / 100) * circumference;
      const remaining = circumference - progress;

      return `
        <svg width="100" height="100" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="#e0e0e0"
            stroke-width="4"
          />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="${color}"
            stroke-width="4"
            stroke-dasharray="${progress.toFixed(2)} ${remaining.toFixed(2)}"
            stroke-dashoffset="25"
            stroke-linecap="round"
            transform="rotate(-90 18 18)"
          />
          <text
            x="18"
            y="22"
            font-size="8"
            fill="${color}"
            text-anchor="middle"
            font-weight="bold"
          >
            ${percentage}%
          </text>
        </svg>
      `;
    };

    // Use safe retention rates (defined in component scope)
    const monthlyRetention = parseFloat(reportData?.retentionRates?.monthly || 0);
    const avgMonthlyAllTutors = parseFloat(reportData?.retentionRates?.avgMonthlyAllTutors || 0);

    const emailContent = `
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Monthly Report</title>

    <style>
      body {
        margin: 0;
        padding: 20px;
        font-family: 'Roboto', Arial, sans-serif;
        background-color: #f9f9f9;
      }
      .container {
        max-width: 800px;
        margin: 20px auto;
        background: #fff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .header {
        background-color: #6a469d;
        padding: 20px;
        text-align: center;
        color: #fff;
      }
      .header img {
        height: 40px;
        margin-bottom: 10px;
      }
      .section {
        padding: 20px;
        background-color: #fff;
        margin: 10px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .section h2 {
        color: #6a469d;
        border-bottom: 2px solid #eee;
        padding-bottom: 8px;
        margin-bottom: 20px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }
      .box {
        background: #f9f9f9;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
      }
      .box h4 {
        color: #6a469d;
        margin-bottom: 10px;
      }
      .box p {
        font-size: 16px;
        font-weight: bold;
      }
      .congrats {
        padding: 20px;
        text-align: center;
        background-color: #F0FFF4;
        border: 2px dashed #4CAF50;
        color: #4CAF50;
        border-radius: 8px;
      }
      .congrats h3 {
        font-size: 1.5rem;
        font-weight: bold;
      }
    </style>

  </head>
  <body style="margin:0; padding:20px; font-family: 'Roboto', Arial, sans-serif; background-color: #f9f9f9;">
    <div style="max-width: 800px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background-color: #6a469d; padding: 20px; text-align: center; color: #fff;">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='20' fill='%236366f1'/%3E%3Ctext x='40' y='34' text-anchor='middle' fill='white' font-size='28' font-weight='700'%3EA%3C/text%3E%3Ctext x='40' y='56' text-anchor='middle' fill='white' font-size='14' font-weight='500' opacity='0.85'%3EOPS%3C/text%3E%3C/svg%3E" alt="Logo" style="height: 40px; margin-bottom: 10px;" />
        <h1 style="margin: 0; font-size: 24px;">Monthly Report</h1>
        <p style="margin: 5px 0 0; font-size: 16px;">Report for ${
          reportData.tutorName || "Unknown Tutor"
        } - ${reportData.month || "Unknown Month"}</p>
      </div>

      <!-- Personal Message -->
      <div style="padding: 20px; background-color: #f4f4f4;">
        <h3 style="color: #6a469d; margin-top: 0;">Hi ${
          reportData.tutorName || "Tutor"
        },</h3>
        <p style="font-size: 14px; line-height: 1.5;">
          ${
            message ||
            "We’re excited to share your performance report for this month. Keep up the great work!"
          }
        </p>
        <!-- Email Signature -->
        <div style="margin-top: 20px; text-align: center;">
          ${emailSignatures[selectedSignature] || emailSignatures.Jessica}
        </div>
      </div>

   <!-- Main Content -->

  <!-- Lessons Summary -->
<!-- Lessons Summary -->
<div style="padding: 20px; background-color: #FFF;">
  <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-bottom: 25px; text-align: center;">
    Lessons Summary
  </h2>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 600px; margin: 0 auto;">
    <tr>
      ${[
        { label: "Total Lesson Hours", value: finalLessons.totalHours || "0.00" },
      ]
        .map(
          (item) => `
            <td style="
              width: 50%;
              padding: 10px;
              text-align: center;
              vertical-align: top;
            ">
              <div style="
                background: #f9f9f9;
                border: 1px solid #ddd; /* Shadow Effect */
                border-radius: 8px;
                padding: 15px;
                text-align: center;
                display: inline-block;
                width: 90%;
              ">
                <h4 style="color: #6a469d; margin: 0 0 10px;">${item.label}</h4>
                <p style="font-size: 16px; font-weight: bold; margin: 0;">${item.value}</p>
              </div>
            </td>
          `
        )
        .join("")}
    </tr>
    <tr>
      ${[
        {
          label: "Consistency Bonus",
          value: `$${finalLessons.consistencyBonus || 0}`,
        },
      ]
        .map(
          (item) => `
            <td style="
              width: 50%;
              padding: 10px;
              text-align: center;
              vertical-align: top;
            ">
              <div style="
                background: #f9f9f9;
                border: 1px solid #ddd; /* Shadow Effect */
                border-radius: 8px;
                padding: 15px;
                text-align: center;
                display: inline-block;
                width: 90%;
              ">
                <h4 style="color: #6a469d; margin: 0 0 10px;">${item.label}</h4>
                <p style="font-size: 16px; font-weight: bold; margin: 0;">${item.value}</p>
              </div>
            </td>
          `
        )
        .join("")}
    </tr>
    <tr>
      ${[
        {
          label: "Additional Students",
          value: finalLessons.additionalStudents || 0,
        },
        { label: "Group Bonus", value: `$${finalLessons.groupBonus || 0}` },
      ]
        .map(
          (item) => `
            <td style="
              width: 50%;
              padding: 10px;
              text-align: center;
              vertical-align: top;
            ">
              <div style="
                background: #f9f9f9;
                border: 1px solid #ddd; /* Shadow Effect */
                border-radius: 8px;
                padding: 15px;
                text-align: center;
                display: inline-block;
                width: 90%;
              ">
                <h4 style="color: #6a469d; margin: 0 0 10px;">${item.label}</h4>
                <p style="font-size: 16px; font-weight: bold; margin: 0;">${item.value}</p>
              </div>
            </td>
          `
        )
        .join("")}
    </tr>
  </table>
</div>

<!-- Consistency Bonus -->
<div style="padding: 20px; background-color: #FFF;">
  <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-bottom: 25px; text-align: center;">
    Consistency Bonus
  </h2>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 600px; margin: 0 auto;">
    <tr>
      ${consistencyProgress
        .map(
          (bonus, index) => `
            <td style="
              width: 33.33%;
              padding: 10px;
              text-align: center;
              vertical-align: top;
            ">
              <div style="
                background: #f9f9f9;
                border: 1px solid #ddd; /* Shadow Effect */
                border-radius: 8px;
                padding: 15px;
                text-align: center;
                display: inline-block;
                width: 90%;
              ">
                <div style="margin-bottom: 15px;">
                  ${generateSvgChart(
                    bonus.progress,
                    index === 0
                      ? "#FFC107"
                      : index === 1
                      ? "#03A9F4"
                      : "#4CAF50"
                  )}
                </div>
                <h4 style="color: #6a469d; margin: 0 0 8px;">${
                  bonus.threshold
                } Hours</h4>
                <p style="margin: 5px 0; font-weight: bold;">${bonus.bonus}</p>
                <p style="margin: 0; color: #757575; font-size: 14px;">${
                  bonus.status
                }</p>
              </div>
            </td>
          `
        )
        .join("")}
    </tr>
  </table>
</div>


        ${
          !isExcluded
            ? `
          <!-- Group Bonus Info -->
          <div style="padding: 20px; background-color: #FFF;">
          <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 5px;">Group Bonus Info</h2>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; padding: 10px; background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; margin: 20px 0;">
            <span style="background-color: #e0f7fa; padding: 6px 12px; border-radius: 4px; font-weight: bold;">1 Student = $0</span>
            <span style="background-color: #ffecb3; padding: 6px 12px; border-radius: 4px; font-weight: bold;">2 = $10</span>
            <span style="background-color: #ffcdd2; padding: 6px 12px; border-radius: 4px; font-weight: bold;">3 = $20</span>
            <span style="background-color: #d1c4e9; padding: 6px 12px; border-radius: 4px; font-weight: bold;">4 = $30</span>
            <span style="background-color: #c8e6c9; padding: 6px 12px; border-radius: 4px; font-weight: bold;">5+ = $40+</span>
          </div>
          </div>
        `
            : ""
        }

        <!-- Leaderboard -->
        <div style="padding: 20px; background-color: #FFF;">
        <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 5px;">Leaderboard (Top 5 Tutors)</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f4f4f4;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Tutor Name</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Lesson Hours</th>
            </tr>
          </thead>
          <tbody>
            ${
              safeLeaderboard.length
                ? safeLeaderboard
                    .map(
                      (entry) => `
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;">${
                    entry.tutorName || "N/A"
                  }</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${
                    entry.totalHours || "0.00"
                  }</td>
                </tr>
              `
                    )
                    .join("")
                : `<tr><td colspan="2" style="padding: 10px; text-align: center;">No data available</td></tr>`
            }
          </tbody>
        </table>

        <!-- Reviews -->
        <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 5px;">Reviews</h2>
        <div style="padding: 20px; background: #f9f9f9; border: 2px dashed #6a469d; border-radius: 8px; text-align: center; margin: 20px 0;">
          ${
            safeReviews.length > 0
              ? safeReviews
                  .map(
                    (review) => `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #ddd;">
                  <strong>${
                    review.reviewerName || "Anonymous"
                  }:</strong> ${"⭐".repeat(review.rating || 0)}<br>
                  <p style="margin-top: 5px; font-size: 14px;">${
                    review.text || "No review text available."
                  }</p>
                </div>
              `
                  )
                  .join("")
              : `
              <div>
                <p style="font-size: 1.2rem; font-weight: bold; color: #6a469d; margin-bottom: 10px;">😔 No reviews yet</p>
                <p style="font-size: 1rem; color: #555; margin-bottom: 10px;">You haven't received any reviews from your clients yet.</p>
                <p style="font-size: 1rem; color: #555;">Clients are sent an automatic review request every 5 lessons, but you can also encourage them to share feedback.</p>
              </div>
            `
          }
        </div>
        </div>

      <!-- Retention Overview -->
      <div style="padding: 20px; background-color: #FFF;">
<h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-bottom: 25px;">
  Retention Overview
</h2>
<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px;">
  ${[
    {
      label: "Monthly Retention",
      description:
        "The percentage of clients who took lessons both last month and this month, showing how well you're keeping clients.",
      value: monthlyRetention,
      color: "#4CAF50",
    },
    {
      label: "All Tutors Avg Monthly Retention",
      description:
        "This metric represents the average monthly retention rate among all of our tutors, giving you a clear benchmark to see how your retention compares.",
      value: avgMonthlyAllTutors,
      color: "#FFC107",
    },
  ]
    .map(
      (metric) => `
      <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center;">
        <div style="margin-bottom: 15px;">
          ${generateSvgChart(metric.value, metric.color)}
        </div>
        <h4 style="color: #6a469d; margin: 0 0 10px;">${metric.label}</h4>
        <p style="font-size: 18px; font-weight: bold; color: ${
          metric.color
        }; margin: 0 0 10px;">${metric.value}%</p>
        <p style="font-size: 14px; color: #555; margin: 0;">${
          metric.description
        }</p>
      </div>
    `
    )
    .join("")}
</div>
</div>


        <!-- Gone Cold Clients -->
        <div style="padding: 20px; background-color: #FFF;">
        <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 5px;">Gone Cold Clients</h2>
        <div style="padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; background-color: ${
          lostClients.filter((client) => {
            const validClientName =
              client.client_name &&
              !["unknown client", "no date available"].includes(
                client.client_name.trim().toLowerCase()
              );
            const validLessonData =
              client.last_lesson_date &&
              client.last_lesson_date.trim().toLowerCase() !== "invalid date" &&
              client.total_lesson_count > 0;
            return validClientName && validLessonData;
          }).length === 0
            ? "#F0FFF4"
            : "#FFCDD2"
        }; border: 2px dashed ${
      lostClients.filter((client) => {
        const validClientName =
          client.client_name &&
          !["unknown client", "no date available"].includes(
            client.client_name.trim().toLowerCase()
          );
        const validLessonData =
          client.last_lesson_date &&
          client.last_lesson_date.trim().toLowerCase() !== "invalid date" &&
          client.total_lesson_count > 0;
        return validClientName && validLessonData;
      }).length === 0
        ? "#4CAF50"
        : "#F44336"
    }; color: ${
      lostClients.filter((client) => {
        const validClientName =
          client.client_name &&
          !["unknown client", "no date available"].includes(
            client.client_name.trim().toLowerCase()
          );
        const validLessonData =
          client.last_lesson_date &&
          client.last_lesson_date.trim().toLowerCase() !== "invalid date" &&
          client.total_lesson_count > 0;
        return validClientName && validLessonData;
      }).length === 0
        ? "#4CAF50"
        : "#F44336"
    };">
          ${
            lostClients.filter((client) => {
              const validClientName =
                client.client_name &&
                !["unknown client", "no date available"].includes(
                  client.client_name.trim().toLowerCase()
                );
              const validLessonData =
                client.last_lesson_date &&
                client.last_lesson_date.trim().toLowerCase() !==
                  "invalid date" &&
                client.total_lesson_count > 0;
              return validClientName && validLessonData;
            }).length === 0
              ? `
              <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">🎉 Congratulations!</h3>
              <p style="font-size: 1rem; margin-bottom: 10px;">No clients have gone cold this period. You're doing an excellent job retaining your clients!</p>
              <p style="font-size: 0.9rem; color: #388e3c;">Keep up the great work!</p>
            `
              : `
              <table style="width: 100%; border-collapse: collapse; margin: 0 auto;">
                <thead>
                  <tr style="background: #f4f4f4;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Client Name</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Last Lesson Date</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Total Lessons</th>
                  </tr>
                </thead>
                <tbody>
                  ${lostClients
                    .filter((client) => {
                      const validClientName =
                        client.client_name &&
                        !["unknown client", "no date available"].includes(
                          client.client_name.trim().toLowerCase()
                        );
                      const validLessonData =
                        client.last_lesson_date &&
                        client.last_lesson_date.trim().toLowerCase() !==
                          "invalid date" &&
                        client.total_lesson_count > 0;
                      return validClientName && validLessonData;
                    })
                    .sort((a, b) => b.total_lesson_count - a.total_lesson_count)
                    .map(
                      (client) => `
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">${client.client_name.trim()}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${
                          dayjs(client.last_lesson_date).isValid()
                            ? dayjs(client.last_lesson_date).format(
                                "MMMM D, YYYY"
                              )
                            : "No Date Available"
                        }</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${
                          client.total_lesson_count || 0
                        }</td>
                      </tr>
                    `
                    )
                    .join("")}
                </tbody>
              </table>
            `
          }
        </div>
        </div>

        ${
          !isExcluded
            ? `
          <!-- Group Bonus Breakdown -->
          <div style="padding: 20px; background-color: #FFF;">
          <h2 style="color: #6a469d; border-bottom: 2px solid #eee; padding-bottom: 5px;">Group Bonus Breakdown</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f4f4f4;">
                <th style="padding: 10px; border: 1px solid #ddd;">Lesson ID</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Lesson Status</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Eligible Students</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Counted Students</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Bonus Earned</th>
              </tr>
            </thead>
            <tbody>
              ${
                groupSessions.length > 0
                  ? groupSessions
                      .filter(
                        (session) => Number(session.counted_students) !== 0
                      )
                      .map(
                        (session) => `
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">
                          <a href="https:
                            session.appointment_id || "N/A"
                          }" target="_blank" style="text-decoration: none; color: #6a469d; font-weight: bold;">
                            ${session.appointment_id || "N/A"}
                          </a>
                        </td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${
                          session.appointment_status || "N/A"
                        }</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${
                          session.total_students || "N/A"
                        }</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${
                          session.counted_students || "N/A"
                        }</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">$${calculateGroupBonus(
                          Number(session.counted_students) || 0
                        )}</td>
                      </tr>
                    `
                      )
                      .join("")
                  : `
                  <tr>
                    <td colspan="5" style="padding: 10px; text-align: center; font-weight: bold; color: #757575;"> No Group Sessions Found</td>
                  </tr>
                `
              }
            </tbody>
          </table>
        `
            : ""
        }

      </div>
      </div>
    </div>
  </body>
</html>
`;

    try {
      const response = await fetch("/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject, message: emailContent }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success("Email sent successfully!");
      } else {
        toast.error(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email.");
    }
  };

  function calculateGroupBonus(countedStudents) {
    if (countedStudents >= 5) return 40;
    if (countedStudents >= 4) return 30;
    if (countedStudents >= 3) return 20;
    if (countedStudents >= 2) return 10;
    return 0;
  }

  const {
    tutor_id: reportTutorId,
    tutorName = "Unknown Tutor",
    month = "Unknown Month",
    lessons = {
      total: 0,
      consistencyBonus: 0,
      additionalStudents: 0,
      groupBonus: 0,
    },
    reviews = [],
    retentionRates = { monthly: 0, annual: 0, avgMonthly: 0, avgAnnual: 0, avgMonthlyAllTutors: 0 },
    leaderboard = [],
  } = reportData || {};

  // Ensure all retention rate values are numbers
  const safeRetentionRates = {
    monthly: parseFloat(retentionRates?.monthly || 0),
    annual: parseFloat(retentionRates?.annual || 0),
    avgMonthly: parseFloat(retentionRates?.avgMonthly || 0),
    avgAnnual: parseFloat(retentionRates?.avgAnnual || 0),
    avgMonthlyAllTutors: parseFloat(retentionRates?.avgMonthlyAllTutors || 0),
  };

  const { monthly, annual, avgMonthly, avgAnnual, avgMonthlyAllTutors } =
    safeRetentionRates;

  const groupSessions = reportData?.groupSessionData || [];

  const totalCountedStudents = groupSessions.reduce(
    (sum, session) => sum + Number(session.counted_students || 0),
    0
  );

  const totalGroupBonus = groupSessions.reduce((sum, session) => {
    return sum + calculateGroupBonus(Number(session.counted_students) || 0);
  }, 0);

  const totalHours = parseFloat(reportData?.lessons?.totalHours || 0);
  const finalLessons = {
    total: reportData?.lessons?.total || 0,
    totalHours: totalHours.toFixed(2),
    consistencyBonus: lessons.consistencyBonus || 0,
    additionalStudents: isExcluded ? 0 : totalGroupBonus / 10,
    groupBonus: isExcluded ? 0 : totalGroupBonus,
  };

  // Debug: Log reviews data (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log("🔍 Reviews Debug:", {
      reviewsType: typeof reportData?.reviews,
      reviewsIsArray: Array.isArray(reportData?.reviews),
      reviewsLength: reportData?.reviews?.length
    });
  }

  const modalContentRef = useRef();

  const handleDownloadPDF = async () => {
    if (!modalContentRef.current) {
      console.error("Element not found for PDF generation.");
      return;
    }

    const elementsToHide = document.querySelectorAll(".hide-in-pdf");
    elementsToHide.forEach((el) => (el.style.display = "none"));

    try {
      const element = modalContentRef.current;
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", [
        canvas.width * 0.264583,
        canvas.height * 0.264583,
      ]);

      pdf.addImage(
        imgData,
        "PNG",
        0,
        0,
        canvas.width * 0.264583,
        canvas.height * 0.264583
      );
      pdf.save(`${tutorName}_Report_${month}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    }

    elementsToHide.forEach((el) => (el.style.display = "block"));
  };

  const selectedTutor = tutorData.find(
    (tutor) => tutor.tutor_name === tutorName
  );

  const lostClients = selectedTutor?.lost_clients_details || [];

  const consistencyThresholds = [40, 60, 80]; // Hours thresholds
  const groupBonus = [0, 10, 20, 30, 40];

  const calculateConsistencyProgress = (totalHours) => {
    const hoursNum = typeof totalHours === 'string' ? parseFloat(totalHours) : totalHours || 0;
    return consistencyThresholds.map((threshold) => {
      const percentage = Math.min(
        (hoursNum / threshold) * 100,
        100
      );
      const percentageFixed = parseFloat(percentage.toFixed(1));
      let status;

      if (percentageFixed >= 100) {
        status = "You Did It!";
      } else if (percentageFixed >= 71) {
        status = "Almost There!";
      } else if (percentageFixed >= 40) {
        status = "So Close!";
      } else {
        status = "Future Goal!";
      }

      return {
        threshold,
        bonus: `$${
          threshold === 40
            ? 200
            : threshold === 60
            ? 400
            : threshold === 80
            ? 600
            : 0
        }`,
        progress: percentageFixed, // Ensure it's always a number
        status,
      };
    });
  };

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log("🛠 Fetched Report Data:", {
        hasLessons: !!reportData?.lessons,
        hasReviews: !!reportData?.reviews,
        reviewsCount: reportData?.reviews?.length || 0
      });
    }
  }, [reportData]);

  // Ensure totalHours is a number for CircularProgress
  const totalHoursNum = typeof totalHours === 'string' ? parseFloat(totalHours) : totalHours || 0;
  const consistencyProgress = calculateConsistencyProgress(totalHoursNum);

  const calculateConsistencyBonus = (totalHours) => {
    if (totalHours >= 80) return 600;
    if (totalHours >= 60) return 400;
    if (totalHours >= 40) return 200;
    return 0;
  };

  if (process.env.NODE_ENV === 'development') {
    console.log("Selected Tutor Lost Clients Count:", lostClients.length);
  }

  const safeReviews = Array.isArray(reviews) ? reviews : [];

  const safeLeaderboard = Array.isArray(leaderboard) ? leaderboard : [];

  const renderStars = (rating) => "⭐".repeat(rating);

  if (loading) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        aria-labelledby="loading-report-modal"
      >
        <Paper
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: 4,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <CircularProgress size={60} sx={{ color: "#6a469d" }} />
          <Typography
            variant="h6"
            sx={{ fontWeight: "bold", color: "#6a469d" }}
          >
            Loading Report...
          </Typography>
        </Paper>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="retention-report-modal"
    >
      <Paper
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "800px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 0,
        }}
      >
        <Box
          sx={{
            backgroundColor: "#6a469d",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 2,
          }}
        >
          <Button
            onClick={handleDownloadPDF}
            variant="contained"
            color="secondary"
            size="small"
            sx={{ marginRight: 2 }}
          >
            Download PDF
          </Button>

          <Button
            onClick={() => setEmailModalOpen(true)}
            variant="contained"
            color="secondary"
            size="small"
            sx={{ marginRight: 2 }}
          >
            Email Report
          </Button>
        </Box>

        <Box ref={modalContentRef}>
          <Box
            sx={{
              backgroundColor: "#6a469d",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 2,
            }}
          >
            <img
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='20' fill='%236366f1'/%3E%3Ctext x='40' y='34' text-anchor='middle' fill='white' font-size='28' font-weight='700'%3EA%3C/text%3E%3Ctext x='40' y='56' text-anchor='middle' fill='white' font-size='14' font-weight='500' opacity='0.85'%3EOPS%3C/text%3E%3C/svg%3E"
              alt="Logo"
              style={{ height: "40px" }}
            />
            <Typography variant="h5" sx={{ color: "#fff", fontWeight: "bold" }}>
              Monthly Report
            </Typography>

            <IconButton
              className="hide-in-pdf"
              onClick={onClose}
              sx={{ color: "#fff" }}
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>

          <Box sx={{ padding: 4 }}>
            <Typography
              variant="h4"
              sx={{ fontWeight: "bold", color: "#6a469d", mb: 4 }}
            >
              Report for {tutorName} - {month}
            </Typography>

            <Typography
              variant="h5"
              sx={{ fontWeight: "bold", color: "#6a469d", mb: 2 }}
            >
              Lessons Summary
            </Typography>

            <Grid container spacing={2} sx={{ mb: 4 }}>
              {[
                { label: "Total Lesson Hours", value: finalLessons.totalHours || "0.00" },
                {
                  label: "Consistency Bonus",
                  value: `$${finalLessons.consistencyBonus || 0}`,
                },
                ...(!isExcluded
                  ? [
                      {
                        label: "Additional Students",
                        value: finalLessons.additionalStudents || 0,
                      },
                      {
                        label: "Group Bonus",
                        value: `$${finalLessons.groupBonus || 0}`,
                      },
                    ]
                  : []),
              ].map((item, index) => (
                <Grid item xs={12} sm={6} key={index}>
                  <Paper
                    sx={{
                      padding: 3,
                      textAlign: "center",
                      border: "1px solid #eee",
                      borderRadius: "8px",
                    }}
                  >
                    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                      {item.label}
                    </Typography>
                    <Typography variant="h6">{item.value}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Typography
              variant="h5"
              sx={{ fontWeight: "bold", color: "#6a469d", mb: 2 }}
            >
              Consistency Bonus
            </Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {consistencyProgress.map((bonus, index) => (
                <Grid item xs={12} sm={4} key={index} sx={{ display: "flex" }}>
                  <Box sx={{ position: "relative", display: "inline-flex" }}>
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      size={100}
                      sx={{ color: "#e0e0e0", position: "absolute" }}
                    />

                    <CircularProgress
                      variant="determinate"
                      value={typeof bonus.progress === 'number' ? bonus.progress : parseFloat(bonus.progress) || 0}
                      size={100}
                      sx={{
                        color:
                          index === 0
                            ? "#FFC107"
                            : index === 1
                            ? "#03A9F4"
                            : "#4CAF50",
                      }}
                    />

                    <Box
                      sx={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        fontWeight: "bold",
                        fontSize: "1.5rem",
                        color: "#6a469d",
                        fontFamily: "Roboto, sans-serif",
                      }}
                    >
                      {bonus.progress}%
                    </Box>
                  </Box>

                  <Box sx={{ textAlign: "left", mt: 2, ml: 2 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: "bold",
                        fontSize: "1rem",
                        fontFamily: "Roboto, sans-serif",
                      }}
                    >
                      {bonus.threshold} Hours = {bonus.bonus}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.875rem",
                        color: "#757575",
                        fontFamily: "Roboto, sans-serif",
                      }}
                    >
                      {bonus.status}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            {!isExcluded ? (
              <>
                <Typography
                  variant="h5"
                  sx={{ fontWeight: "bold", color: "#6a469d", mb: 2 }}
                >
                  Group Bonus Info
                </Typography>

                <Box
                  sx={{
                    width: "100%",
                    padding: 2,
                    border: "1px solid #eee",
                    borderRadius: 2,
                    mb: 2,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="space-evenly"
                  >
                    <Chip
                      label="1 Student = $0"
                      sx={{ backgroundColor: "#e0f7fa", fontWeight: "bold" }}
                    />
                    <Chip
                      label="2 = $10"
                      sx={{ backgroundColor: "#ffecb3", fontWeight: "bold" }}
                    />
                    <Chip
                      label="3 = $20"
                      sx={{ backgroundColor: "#ffcdd2", fontWeight: "bold" }}
                    />
                    <Chip
                      label="4 = $30"
                      sx={{ backgroundColor: "#d1c4e9", fontWeight: "bold" }}
                    />
                    <Chip
                      label="5+ = $40+"
                      sx={{ backgroundColor: "#c8e6c9", fontWeight: "bold" }}
                    />
                  </Stack>
                </Box>
              </>
            ) : null}

            <Box sx={{ mb: 4 }}>
              <Typography
                variant="h5"
                sx={{ fontWeight: "bold", color: "#6a469d", mb: 2 }}
              >
                Leaderboard (Top 5 Tutors)
              </Typography>
              <Table
                sx={{
                  border: "1px solid #eee",
                  width: "100%",
                  "& .MuiTableCell-root": {
                    padding: "4px 8px",
                    fontSize: "0.875rem",
                    border: "1px solid #eee",
                    textAlign: "center",
                  },
                  "& .MuiTableHead-root .MuiTableCell-root": {
                    fontWeight: "bold",
                    backgroundColor: "#f4f4f4",
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Tutor Name</TableCell>

                    <TableCell>Lesson Hours</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leaderboard.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>{entry.tutorName || "N/A"}</TableCell>

                      <TableCell>{entry.totalHours || "0.00"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            <Typography
              variant="h5"
              sx={{ fontWeight: "bold", color: "#6a469d", mb: 2, mt: 4 }}
            >
              Reviews
            </Typography>
            <Box sx={{ mb: 4 }}>
              {safeReviews.length > 0 ? (
                safeReviews.map((review, index) => (
                  <Box key={index} sx={{ mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                      {renderStars(review.rating || 0)}{" "}
                      {review.reviewerName || "Anonymous"}
                    </Typography>
                    <Typography variant="body1">
                      {review.text || "No review text available"}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Box
                  sx={{
                    textAlign: "center",
                    padding: 4,
                    border: "2px dashed #6a469d",
                    borderRadius: 2,
                    backgroundColor: "#f9f9f9",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      color: "#6a469d",
                      mb: 1,
                    }}
                  >
                    😔 No reviews yet
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "1rem",
                      color: "#555",
                      mb: 2,
                    }}
                  >
                    You haven't received any reviews from your clients yet.
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "1rem",
                      color: "#555",
                      mb: 2,
                    }}
                  >
                    Clients are sent an automatic review request every 5
                    lessons, ask your parents to let you know how you’re doing!
                  </Typography>
                </Box>
              )}
            </Box>

            <Typography
              variant="h5"
              sx={{ fontWeight: "bold", color: "#6a469d", mb: 3 }}
            >
              Retention Overview
            </Typography>

            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6}>
                <Paper
                  sx={{
                    padding: 3,
                    textAlign: "center",
                    border: "1px solid #eee",
                    borderRadius: "8px",
                  }}
                >
                  <Box sx={{ position: "relative", display: "inline-flex" }}>
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      size={80}
                      sx={{ color: "#e0e0e0", position: "absolute" }}
                    />
                    <CircularProgress
                      variant="determinate"
                      value={monthly}
                      size={80}
                      sx={{ color: "#4CAF50" }}
                    />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: "bold", mt: 2 }}>
                    Monthly Retention
                  </Typography>
                  <Typography variant="h4" sx={{ color: "#4CAF50" }}>
                    {monthly.toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    The percentage of clients who took lessons both last month
                    and this month, showing how well you’re keeping clients.
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Paper
                  sx={{
                    padding: 3,
                    textAlign: "center",
                    border: "1px solid #eee",
                    borderRadius: "8px",
                  }}
                >
                  <Box sx={{ position: "relative", display: "inline-flex" }}>
                    <CircularProgress
                      variant="determinate"
                      value={100}
                      size={80}
                      sx={{ color: "#e0e0e0", position: "absolute" }}
                    />
                    <CircularProgress
                      variant="determinate"
                      value={avgMonthlyAllTutors}
                      size={80}
                      sx={{ color: "#FFC107" }}
                    />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: "bold", mt: 2 }}>
                    All Tutors Avg Monthly Retention
                  </Typography>
                  <Typography variant="h4" sx={{ color: "#FFC107" }}>
                    {avgMonthlyAllTutors.toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    This metric represents the average monthly retention rate
                    among all of our tutors, giving you a clear benchmark to see
                    how your retention compares.
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Typography
              variant="h5"
              sx={{ fontWeight: "bold", color: "#6a469d", mb: 3, mt: 3 }}
            >
              Gone Cold Clients (Lost Clients Period)
            </Typography>

            {lostClients.filter((client) => {
              const validClientName =
                client.client_name &&
                client.client_name.trim().toLowerCase() !== "unknown client" &&
                client.client_name.trim().toLowerCase() !== "no date available";

              const validLessonData =
                client.last_lesson_date &&
                client.last_lesson_date.trim().toLowerCase() !==
                  "invalid date" &&
                client.total_lesson_count > 0;

              return validClientName && validLessonData;
            }).length === 0 ? (
              <Box
                sx={{
                  textAlign: "center",
                  padding: 4,
                  border: "2px dashed #4CAF50",
                  borderRadius: 2,
                  backgroundColor: "#f0fff4",
                  color: "#4CAF50",
                  mb: 3,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "1.5rem",
                    fontWeight: "bold",
                    mb: 1,
                  }}
                >
                  🎉 Congratulations!
                </Typography>
                <Typography
                  sx={{
                    fontSize: "1rem",
                    fontWeight: "normal",
                    color: "#388e3c",
                  }}
                >
                  No clients have gone cold in this period. You're doing an
                  excellent job retaining your clients!
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.9rem",
                    fontWeight: "normal",
                    mt: 1,
                    color: "#388e3c",
                  }}
                >
                  Keep up the great work and continue to engage with your
                  students for long-term success. 💪
                </Typography>
              </Box>
            ) : (
              <Table
                sx={{
                  border: "1px solid #eee",
                  width: "100%",
                  "& .MuiTableCell-root": {
                    padding: "4px 8px",
                    fontSize: "0.875rem",
                    border: "1px solid #eee",
                    textAlign: "center",
                  },
                  "& .MuiTableHead-root .MuiTableCell-root": {
                    fontWeight: "bold",
                    backgroundColor: "#f4f4f4",
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Client Name</TableCell>
                    <TableCell>Last Lesson Date</TableCell>
                    <TableCell>Total Lifetime Lessons</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lostClients
                    .filter((client) => {
                      const validClientName =
                        client.client_name &&
                        client.client_name.trim().toLowerCase() !==
                          "unknown client" &&
                        client.client_name.trim().toLowerCase() !==
                          "no date available";

                      const validLessonData =
                        client.last_lesson_date &&
                        client.last_lesson_date.trim().toLowerCase() !==
                          "invalid date" &&
                        client.total_lesson_count > 0;

                      return validClientName && validLessonData;
                    })
                    .sort((a, b) => b.total_lesson_count - a.total_lesson_count)
                    .map((client, index) => (
                      <TableRow key={index}>
                        <TableCell>{client.client_name.trim()}</TableCell>
                        <TableCell>
                          {dayjs(client.last_lesson_date).isValid()
                            ? dayjs(client.last_lesson_date).format(
                                "MMMM D, YYYY"
                              )
                            : "No Date Available"}
                        </TableCell>
                        <TableCell>{client.total_lesson_count || 0}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}

            {!isExcluded && (
              <>
                <Typography
                  variant="h5"
                  sx={{ fontWeight: "bold", color: "#6a469d", mb: 2, mt: 4 }}
                >
                  Group Bonus Breakdown
                </Typography>

                <Table
                  sx={{
                    border: "1px solid #eee",
                    width: "100%",
                    "& .MuiTableCell-root": {
                      padding: "4px 8px",
                      fontSize: "0.875rem",
                      border: "1px solid #eee",
                      textAlign: "center",
                    },
                    "& .MuiTableHead-root .MuiTableCell-root": {
                      fontWeight: "bold",
                      backgroundColor: "#f4f4f4",
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Lesson ID</TableCell>
                      <TableCell>Lesson Status</TableCell>
                      <TableCell>Eligible Students</TableCell>
                      <TableCell>Counted Students</TableCell>
                      <TableCell>Bonus Earned</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupSessions.length > 0 ? (
                      groupSessions
                        .filter(
                          (session) => Number(session.counted_students) !== 0
                        )
                        .map((session, index) => (
                          <TableRow key={session.appointment_id || index}>
                            <TableCell>
                              <a
                                href={`https://secure.tutorcruncher.com/cal/appointments/${
                                  session.appointment_id || "N/A"
                                }`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  textDecoration: "none",
                                  color: "#6a469d",
                                  fontWeight: "bold",
                                }}
                              >
                                {session.appointment_id || "N/A"}
                              </a>
                            </TableCell>
                            <TableCell>
                              {session.appointment_status || "N/A"}
                            </TableCell>
                            <TableCell>
                              {session.total_students || "N/A"}
                            </TableCell>
                            <TableCell>
                              {session.counted_students || "N/A"}
                            </TableCell>
                            <TableCell>
                              $
                              {calculateGroupBonus(
                                Number(session.counted_students) || 0
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          sx={{
                            textAlign: "center",
                            fontWeight: "bold",
                            color: "#757575",
                          }}
                        >
                           No Group Sessions Found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>
        </Box>

        <EmailModal
          open={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          onSend={handleEmailReport}
          defaultTutorId={tutorId}
          defaultTutorName={tutorName || ""}
          selectedSignature={selectedSignature}
        />
      </Paper>
    </Modal>
  );
};

export default RetentionReportModal;

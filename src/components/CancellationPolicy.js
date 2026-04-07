import React from "react";

const CancellationPolicy = () => (
  <>
    <h3
      style={{
        fontSize: "1rem",
        fontWeight: 600,
        marginBottom: "0.5rem",
        marginTop: "0.5rem",
      }}
    >
      In-Home Cancellation Policy
    </h3>
    <ul style={{ listStyleType: "disc", paddingLeft: "20px" }}>
      <li>
        We kindly request that clients provide a 24-hour notice for canceling a
        lesson.
      </li>
      <li>
        We make exceptions for cancellations due to a child’s illness or injury,
        as we understand these situations are beyond your control.
      </li>
      <li>
        Our Cancellation Policy primarily serves to protect our tutors from
        last-minute cancellations. If a lesson is canceled just hours before its
        start or if there’s a No Call/No Show, the tutor has often already
        committed to their teaching route for the day. In cases where a tutor
        arrives and no one is home, or the client cancels upon arrival without
        prior notice, the client will be charged for the lesson as compensation
        for the tutor’s time and effort.
      </li>
    </ul>
  </>
);

export default CancellationPolicy;

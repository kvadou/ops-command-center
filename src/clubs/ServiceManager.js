import React, { useState } from "react";
import axios from "axios";

export default function ServiceManager({ onServicesUpdated }) {
  const [serviceId, setServiceId] = useState("");
  const [location, setLocation] = useState("Park Slope");
  const [serviceIds, setServiceIds] = useState([]);

  const addServiceId = async () => {
    if (serviceId) {
      const response = await axios.post("/api/services", {
        serviceId,
        location,
      });
      setServiceIds(response.data.serviceIds);
      setServiceId("");
      onServicesUpdated(response.data.serviceIds);
    }
  };

  return (
    <div>
      <CustomFormControl fullWidth margin="dense">
        <InputLabel>Location</InputLabel>
        <Select
          value={location}
          onChange={handleLocationChange}
          sx={{
            "& .MuiSelect-icon": {
              color: "#FFFFFF",
            },
          }}
        >
          <MenuItem value="">All Locations</MenuItem>
          <MenuItem value="Park Slope">Park Slope</MenuItem>
          <MenuItem value="Upper East Side">Upper East Side</MenuItem>
        </Select>
      </CustomFormControl>
      <h2>Manage Service IDs</h2>
      <input
        type="text"
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
        placeholder="Enter service ID"
      />
      <select value={location} onChange={(e) => setLocation(e.target.value)}>
        <option value="Park Slope">Park Slope</option>
        <option value="Upper East Side">Upper East Side</option>
      </select>
      <button onClick={addServiceId}>Add Service ID</button>
      <ul>
        {serviceIds.map((service, index) => (
          <li key={index}>
            {service.serviceId} - {service.location}
          </li>
        ))}
      </ul>
    </div>
  );
}

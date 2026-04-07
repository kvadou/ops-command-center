import axios from "axios";

let eventGuid = 0;
let todayStr = new Date().toISOString().replace(/T.*$/, "");

export function createEventId() {
  return String(eventGuid++);
}

export const fetchEvents = async (
  startDate,
  endDate,
  location = "",
  serviceId = ""
) => {
  try {
    const response = await axios.get("/api/events", {
      params: { location, startDate, endDate, serviceId },
    });

    return response.data.map((event) => {
      return {
        id: event.id,
        title: event.serviceName,
        start: event.start,
        end: event.end,
        location: event.location || "Unknown Location",
        serviceId: event.serviceId,
        colourGroup: event.colourGroup,
        extendedProps: {
          serviceId: event.serviceId,
          price: event.price,
          selectedImage: event.selectedImage,
          type: event.type,
          colourGroup: event.colourGroup,
          dft_max_srs: event.dft_max_srs,
          rcrs: event.rcrs,
          serviceDescription: event.serviceDescription,
          labelId: event.labelId,
          labelName: event.labelName,
        },
      };
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
};

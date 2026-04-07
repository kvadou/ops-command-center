import axios from "axios";

export const fetchRevenueData = async (startDate, endDate) => {
  try {
    const response = await axios.post(
      "/revenue-by-division",
      {
        startDate: startDate.format("YYYY-MM-DD"),
        endDate: endDate.format("YYYY-MM-DD"),
      },
      {
        withCredentials: true,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    throw error;
  }
};

import React from "react";
import { Tooltip, Chip, SvgIcon } from "@mui/material";
import { Box, Typography } from "@mui/joy";
import Card from "@mui/joy/Card";
import CardContent from "@mui/joy/CardContent";
import Avatar from "@mui/joy/Avatar";
import { ArrowUpIcon, ArrowDownIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const StatisticCard = ({
  title,
  cost,
  costLabel = "Total Spend:",
  subValue,
  value,
  percentageChange,
  subtitle,
  isPositive,
  hidePercentageChange,
  icon = null,
  bgColor = "neutral.softBg",
  iconBgColor = "neutral.softBg",
  iconColor = "neutral.solidActive",
  ...props
}) => {
  return (
    <Card
      variant="solid"
      sx={{
        minWidth: 275,
        borderRadius: "md",
        display: "flex",
        alignItems: "left",
        padding: 2,
        gap: 2,
        backgroundColor: bgColor,
        color: "white",
        ...props.sx,
      }}
    >
      {icon && (
        <Avatar
          size="lg"
          sx={{
            bgcolor: iconBgColor,
            color: iconColor,
            width: 56,
            height: 56,
          }}
        >
          <SvgIcon>{icon}</SvgIcon>
        </Avatar>
      )}

      <CardContent
        orientation="vertical"
        sx={{
          flex: 1,
          textAlign: "left",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Typography level="body-md" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {subValue && (
            <Typography level="body-xs" sx={{ ml: 2, color: "gray" }}>
              {subValue}
            </Typography>
          )}
        </Box>

        {cost != null && (
          <Typography level="body-xs" sx={{ mt: 0.25 }}>
            {costLabel} {currencyFormatter.format(cost)}
          </Typography>
        )}

        <Typography level="h2" sx={{ fontWeight: "bold" }}>
          {value}
        </Typography>

        {subtitle && (
          <Typography
            level="body-xs"
            sx={{ mt: 0.5, color: "black", opacity: 0.8 }}
          >
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default StatisticCard;

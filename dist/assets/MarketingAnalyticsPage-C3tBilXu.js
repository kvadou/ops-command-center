import{aK as i,j as e}from"./index-ChOeMGxY.js";import{r as o}from"./react-vendor-BtGAymLz.js";import r from"./BookingFormAnalytics-B0y0owWA.js";import"./utils-vendor-t2GF0uPA.js";import"./editor-vendor-BsvHJqz8.js";import"./mui-vendor-CvBDhMf-.js";import"./chart-vendor-CuSrAjIy.js";import"./formatters-DflPWXVw.js";import"./DateRangePicker-CBsmhvw_.js";import"./ChevronLeftIcon-BCPFmQ_I.js";import"./CalendarIcon-DMhwnj8a.js";import"./ChevronRightIcon-CHA1JJ_U.js";import"./ArrowTrendingUpIcon-BSEqdNhg.js";import"./ArrowTrendingDownIcon-DbleE6a2.js";import"./Cog6ToothIcon-r0MwHeGN.js";import"./ArrowLeftIcon-DSgZdJbJ.js";import"./TrashIcon-DEhVgX2t.js";import"./ArrowDownIcon-0MKxVlvb.js";import"./ArrowUpIcon-Qx7sTIhs.js";const a=()=>e.jsxDEV("div",{className:"flex items-center justify-center min-h-screen",children:e.jsxDEV("div",{className:"text-center",children:[e.jsxDEV("div",{className:"animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:8,columnNumber:7},void 0),e.jsxDEV("p",{className:"mt-4 text-neutral-600",children:"Loading..."},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:9,columnNumber:7},void 0)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:7,columnNumber:5},void 0)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:6,columnNumber:3},void 0);function A(){const{actions:n}=i();return o.useEffect(()=>{const t=document.createElement("style");return t.textContent=`
      /* Ensure settings button has 32px padding (minimum 56x56px hit area) */
      .marketing-header-actions button {
        min-width: 56px !important;
        min-height: 56px !important;
        padding: 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      /* Position DateRangePicker in header center */
      /* The DateRangePicker container needs to be positioned relative to the marketing-analytics-container */
      .marketing-analytics-container {
        position: relative !important;
        overflow: visible !important;
      }
      
      /* Position the DateRangePicker container absolutely within the marketing-analytics-container */
      /* Align it vertically with the header row (Marketing title and config button) */
      /* Account for container padding (p-6 sm:p-8 = 24px/32px) and header row center */
      /* Header is at top (24px padding) + half of header height (~30px) = ~54px from top of container */
      .marketing-analytics-container .marketing-date-range-picker-container {
        position: absolute !important;
        top: 54px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 10 !important;
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: auto !important;
        width: auto !important;
        height: auto !important;
        visibility: visible !important;
        opacity: 1 !important;
        display: flex !important;
        align-items: center !important;
      }
      
      /* Ensure the header container has relative positioning and enough height */
      .marketing-header-container {
        position: relative !important;
        min-height: 60px !important;
      }
      
      /* Make sure DateRangePicker content is visible and interactive */
      .marketing-date-range-picker-container * {
        pointer-events: auto !important;
      }
      
      /* Ensure the DateRangePicker is visible */
      .marketing-date-range-picker-container,
      .marketing-date-range-picker-container > * {
        visibility: visible !important;
        opacity: 1 !important;
        display: flex !important;
      }
      
      /* On mobile, position it below the header */
      @media (max-width: 1023px) {
        .marketing-analytics-container .marketing-date-range-picker-container {
          position: relative !important;
          top: auto !important;
          left: auto !important;
          transform: none !important;
          margin-top: 1rem !important;
        }
      }
    `,document.head.appendChild(t),()=>{document.head.contains(t)&&document.head.removeChild(t)}},[]),e.jsxDEV("div",{className:"max-w-7xl mx-auto w-full",children:e.jsxDEV("div",{className:"bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sm:p-8 marketing-analytics-container",children:[e.jsxDEV("div",{className:"marketing-header-container relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3 gap-4 lg:gap-0 px-6 sm:px-8",children:[e.jsxDEV("div",{className:"flex-shrink-0 flex items-center order-1 lg:order-1",children:e.jsxDEV("h1",{className:"text-2xl font-bold text-neutral-900",children:"Marketing"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:106,columnNumber:15},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:105,columnNumber:13},this),e.jsxDEV("div",{className:"flex-1 flex items-center justify-center lg:absolute lg:left-1/2 lg:-translate-x-1/2 z-10 order-3 lg:order-2 pointer-events-none"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:110,columnNumber:13},this),e.jsxDEV("div",{className:"flex-shrink-0 lg:flex-1 flex items-center justify-end min-w-0 order-2 lg:order-3",children:n?e.jsxDEV("div",{className:"flex items-center marketing-header-actions",children:n},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:117,columnNumber:17},this):e.jsxDEV("div",{className:"w-14 h-14 flex-shrink-0"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:121,columnNumber:17},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:115,columnNumber:13},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:103,columnNumber:11},this),e.jsxDEV(o.Suspense,{fallback:e.jsxDEV(a,{},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:126,columnNumber:31},this),children:e.jsxDEV(r,{},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:127,columnNumber:13},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:126,columnNumber:11},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:99,columnNumber:9},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/MarketingAnalyticsPage.js",lineNumber:98,columnNumber:7},this)}export{A as default};

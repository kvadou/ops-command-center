import{j as e}from"./index-ChOeMGxY.js";import{r as f,a as g}from"./react-vendor-BtGAymLz.js";const v=f.forwardRef(({variant:n="primary",size:o="md",fullWidth:r=!1,loading:s=!1,disabled:a=!1,leftIcon:m,rightIcon:i,children:t,className:c="",as:h="button",...x},N)=>{const w=`
    inline-flex items-center justify-center gap-2
    font-medium
    rounded-button
    transition-all duration-200 ease-smooth
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
    select-none
  `.replace(/\s+/g," ").trim(),l={primary:`
      bg-primary-500 text-white
      hover:bg-primary-600 active:bg-primary-700
      focus-visible:ring-primary-500
      shadow-button hover:shadow-button-hover
    `,secondary:`
      bg-neutral-100 text-neutral-700
      hover:bg-neutral-200 active:bg-neutral-300
      focus-visible:ring-neutral-400
      border border-neutral-200
    `,outline:`
      bg-transparent text-primary-500
      border-2 border-primary-500
      hover:bg-primary-50 active:bg-primary-100
      focus-visible:ring-primary-500
    `,ghost:`
      bg-transparent text-neutral-600
      hover:bg-neutral-100 active:bg-neutral-200
      focus-visible:ring-neutral-400
    `,danger:`
      bg-error text-white
      hover:bg-error-dark active:bg-error-dark
      focus-visible:ring-error
      shadow-button hover:shadow-error
    `,success:`
      bg-success text-white
      hover:bg-success-dark active:bg-success-dark
      focus-visible:ring-success
      shadow-button hover:shadow-success
    `,purple:`
      bg-primary-500 text-white
      hover:bg-primary-600 active:bg-primary-700
      focus-visible:ring-primary-500
      shadow-button hover:shadow-button-hover
    `},j={xs:"h-7 px-2.5 text-xs gap-1.5",sm:"h-8 px-3 text-sm gap-1.5",md:"h-10 px-4 text-sm gap-2",lg:"h-11 px-5 text-base gap-2",xl:"h-12 px-6 text-base gap-2.5"},d={xs:"h-3.5 w-3.5",sm:"h-4 w-4",md:"h-4 w-4",lg:"h-5 w-5",xl:"h-5 w-5"},p=()=>e.jsxDEV("svg",{className:`animate-spin ${d[o]}`,xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",children:[e.jsxDEV("circle",{className:"opacity-25",cx:"12",cy:"12",r:"10",stroke:"currentColor",strokeWidth:"4"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:119,columnNumber:7},void 0),e.jsxDEV("path",{className:"opacity-75",fill:"currentColor",d:"M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:127,columnNumber:7},void 0)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:113,columnNumber:5},void 0),b=u=>u?g.cloneElement(u,{className:`${d[o]} ${u.props.className||""}`.trim()}):null,y=`
    ${w}
    ${l[n]||l.primary}
    ${j[o]}
    ${r?"w-full":""}
    ${c}
  `.replace(/\s+/g," ").trim(),k=e.jsxDEV(e.Fragment,{children:[s?e.jsxDEV(p,{},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:153,columnNumber:18},void 0):b(m),t&&e.jsxDEV("span",{className:s?"opacity-0":"",children:t},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:154,columnNumber:20},void 0),!s&&b(i),s&&t&&e.jsxDEV("span",{className:"absolute inset-0 flex items-center justify-center",children:e.jsxDEV(p,{},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:158,columnNumber:11},void 0)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:157,columnNumber:9},void 0)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:152,columnNumber:5},void 0);return e.jsxDEV(h,{ref:N,className:y,disabled:a||s,...x,children:k},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:165,columnNumber:5},void 0)});v.displayName="Button";const B=f.forwardRef(({variant:n="ghost",size:o="md",icon:r,label:s,className:a="",...m},i)=>{const t={xs:"h-7 w-7",sm:"h-8 w-8",md:"h-10 w-10",lg:"h-11 w-11",xl:"h-12 w-12"},c={xs:"h-3.5 w-3.5",sm:"h-4 w-4",md:"h-5 w-5",lg:"h-5 w-5",xl:"h-6 w-6"};return e.jsxDEV(v,{ref:i,variant:n,size:o,className:`!p-0 ${t[o]} ${a}`,"aria-label":s,title:s,...m,children:r&&g.cloneElement(r,{className:`${c[o]} ${r.props.className||""}`.trim()})},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/ui/Button.js",lineNumber:206,columnNumber:5},void 0)});B.displayName="IconButton";export{v as B};

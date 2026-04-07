import{j as t}from"./index-ChOeMGxY.js";import{r as n,L as F}from"./react-vendor-BtGAymLz.js";import{F as I,i as z,a as G,b as K,c as B}from"./index-ChlxDh1_.js";import{s as V}from"./safeRender-C64Kkjhv.js";import{L as Y}from"./LessonDetailModal-3YqG6jFt.js";import{F as H}from"./PlusIcon-CkWso4Q0.js";import{F as J}from"./ListBulletIcon-p9FiJQwo.js";import"./utils-vendor-t2GF0uPA.js";import"./editor-vendor-BsvHJqz8.js";import"./mui-vendor-CvBDhMf-.js";import"./chart-vendor-CuSrAjIy.js";import"./CalendarIcon-DMhwnj8a.js";function ce(){const[C,x]=n.useState([]),[U,k]=n.useState(!0),[$,y]=n.useState(null),[R,D]=n.useState(!1),[p,w]=n.useState({start:null,end:null}),i=n.useRef(null),h=n.useRef({filters:{},dateRange:null}),[N,W]=n.useState({tutor:"",student:"",client:"",job:"",lessonStatus:"",location:"",invoiceStatus:"",colourBy:"job"}),[r,j]=n.useState({lessons:!0,support:!0,cancelled:!0}),L=["Club - Park Slope","Club - Park Slope Support"],u=n.useRef(new Map),b=n.useCallback(async(e,s,o)=>{const l=JSON.stringify(o),c=`${e==null?void 0:e.toISOString()}_${s==null?void 0:s.toISOString()}`,d=`${l}_${c}`;if(u.current.has(d)){const a=u.current.get(d);x(a);return}if(!(h.current.filters===l&&h.current.dateRange===c)){k(!0);try{const a=new URLSearchParams({start_date:e.toISOString(),end_date:s.toISOString(),labels:JSON.stringify(L)});o.tutor&&a.append("tutor_id",o.tutor),o.student&&a.append("student_id",o.student),o.client&&a.append("client_id",o.client),o.job&&a.append("service_id",o.job),o.lessonStatus&&a.append("status",o.lessonStatus),o.location&&a.append("location",o.location);const f=`/api/entity-lists/calendar/events?${a.toString()}`,g=await(await fetch(f)).json(),m=g.events||g.lessons||g.data||[];if(u.current.set(d,m),u.current.size>10){const E=u.current.keys().next().value;u.current.delete(E)}x(m),h.current={filters:l,dateRange:c}}catch(a){console.error("Error fetching lessons:",a)}finally{k(!1)}}},[]),_=n.useCallback(e=>{const s=new Date(e.start);s.setDate(s.getDate()-7);const o=new Date(e.end);o.setDate(o.getDate()+7),w({start:s,end:o}),i.current&&clearTimeout(i.current),i.current=setTimeout(()=>{b(s,o,N)},200)},[N,b]),S=n.useRef(!1);n.useEffect(()=>{if(S.current)return;S.current=!0;const e=new Date,s=new Date(e.getFullYear(),e.getMonth(),1),o=new Date(e.getFullYear(),e.getMonth()+1,0);w({start:s,end:o}),b(s,o,{tutor:"",student:"",client:"",job:"",lessonStatus:"",location:"",invoiceStatus:"",colourBy:"job"})},[]),n.useEffect(()=>{if(!(!p.start||!p.end))return i.current&&clearTimeout(i.current),i.current=setTimeout(()=>{b(p.start,p.end,N)},500),()=>{i.current&&clearTimeout(i.current)}},[N,p,b]);const M=n.useMemo(()=>!C||!Array.isArray(C)?[]:C.filter(e=>{const s=e.service_labels||[],o=Array.isArray(s)?s.some(c=>typeof c=="string"&&c.includes("Support")):typeof s=="string"&&s.includes("Support"),l=e.status==="cancelled"||e.status==="cancelled-chargeable";return!(l&&!r.cancelled||o&&!r.support||!o&&!l&&!r.lessons)}).map(e=>{const s=new Date(e.start),o=new Date(e.finish);let l,c,d="#ffffff";if(e.status==="cancelled"||e.status==="cancelled-chargeable")l="#FACC29",c="#FACC29",d="#1f2937";else{const m=e.service_labels||[];l=(Array.isArray(m)?m.some(P=>typeof P=="string"&&P.includes("Support")):typeof m=="string"&&m.includes("Support"))?"#ff1493":"#1e90ff",c=l}const f=V(e.service_name)||`Service ${e.service_id}`,v=V(e.topic),g=v?`${f} - ${v}`:f;return{id:`lesson-${e.appointment_id}`,title:g,start:s.toISOString(),end:o.toISOString(),backgroundColor:l,borderColor:c,textColor:d,extendedProps:{lesson:e,lessonId:e.appointment_id,serviceId:e.service_id,serviceName:f,topic:v,status:e.status}}}),[C,r]),A=e=>{const s=e.event.extendedProps.lesson;s&&(y(s),D(!0))},T=e=>{const{serviceName:s}=e.event.extendedProps,o=e.timeText;return t.jsxDEV("div",{className:"fc-event-main-frame fc-event-main",children:[t.jsxDEV("div",{className:"fc-event-time fc-event-time-container",children:t.jsxDEV("span",{className:"fc-event-time-text font-semibold",children:o},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:269,columnNumber:11},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:268,columnNumber:9},this),t.jsxDEV("div",{className:"fc-event-title-container",children:t.jsxDEV("div",{className:"fc-event-title fc-sticky text-sm font-medium",children:s},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:272,columnNumber:11},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:271,columnNumber:9},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:267,columnNumber:7},this)},O=()=>{D(!1),y(null)};return t.jsxDEV(t.Fragment,{children:[t.jsxDEV("div",{className:"space-y-6",children:[t.jsxDEV("div",{className:"flex flex-wrap items-center gap-3",children:[t.jsxDEV("button",{className:"inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium",children:[t.jsxDEV(H,{className:"h-5 w-5"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:291,columnNumber:13},this),"Add New Lesson"]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:290,columnNumber:11},this),t.jsxDEV(F,{to:"/lessons",className:"inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors duration-200 font-medium",children:[t.jsxDEV(J,{className:"h-5 w-5"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:298,columnNumber:13},this),"View in list"]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:294,columnNumber:11},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:289,columnNumber:9},this),t.jsxDEV("div",{className:"bg-white rounded-xl shadow-lg overflow-hidden relative",children:[t.jsxDEV("style",{children:`
            .fc {
              font-family: 'Poppins', sans-serif;
            }

            .fc-header-toolbar {
              padding: 1.5rem;
              margin-bottom: 0;
              background: linear-gradient(to right, #6A469D, #2D2F8E);
              border-radius: 0.75rem 0.75rem 0 0;
            }

            .fc-toolbar-title {
              color: white;
              font-weight: 700;
              font-size: 1.5rem;
            }

            .fc-button {
              background-color: rgba(255, 255, 255, 0.2) !important;
              border: 1px solid rgba(255, 255, 255, 0.3) !important;
              color: white !important;
              padding: 0.5rem 1rem !important;
              border-radius: 0.5rem !important;
              font-weight: 500 !important;
              transition: all 0.2s !important;
            }

            .fc-button:hover {
              background-color: rgba(255, 255, 255, 0.3) !important;
              border-color: rgba(255, 255, 255, 0.5) !important;
            }

            .fc-button-active {
              background-color: white !important;
              color: #6A469D !important;
              font-weight: 600 !important;
            }

            .fc-daygrid-day {
              border-color: #e5e7eb !important;
            }

            .fc-day-today {
              background-color: #E8FBFF !important;
            }

            .fc-day-today .fc-daygrid-day-number {
              color: #6A469D;
              font-weight: 700;
            }

            .fc-col-header-cell {
              background-color: #f9fafb;
              border-color: #e5e7eb;
              padding: 0.75rem;
              font-weight: 600;
              color: #374151;
              text-transform: uppercase;
              font-size: 0.75rem;
              letter-spacing: 0.05em;
            }

            .fc-event {
              border-radius: 0.5rem !important;
              border: none !important;
              padding: 0.25rem 0.5rem !important;
              margin: 0.125rem 0 !important;
              cursor: pointer;
              transition: all 0.2s;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }

            .fc-event:hover {
              transform: translateY(-1px);
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
              z-index: 10;
            }
          `},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:306,columnNumber:11},this),t.jsxDEV("div",{className:"flex items-center gap-4 mt-2 mb-4 px-2",children:[t.jsxDEV("button",{onClick:()=>j(e=>({...e,lessons:!e.lessons})),className:`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${r.lessons?"border-blue-500 bg-blue-50":"border-neutral-300 bg-neutral-100 opacity-50"}`,children:[t.jsxDEV("div",{className:`w-4 h-4 rounded ${r.lessons?"bg-blue-500":"bg-neutral-400"}`},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:396,columnNumber:15},this),t.jsxDEV("span",{className:`text-sm font-medium ${r.lessons?"text-neutral-700":"text-neutral-400"}`,children:"Lessons"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:399,columnNumber:15},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:388,columnNumber:13},this),t.jsxDEV("button",{onClick:()=>j(e=>({...e,support:!e.support})),className:`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${r.support?"border-pink-500 bg-pink-50":"border-neutral-300 bg-neutral-100 opacity-50"}`,children:[t.jsxDEV("div",{className:`w-4 h-4 rounded ${r.support?"bg-pink-500":"bg-neutral-400"}`},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:411,columnNumber:15},this),t.jsxDEV("span",{className:`text-sm font-medium ${r.support?"text-neutral-700":"text-neutral-400"}`,children:"Support"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:414,columnNumber:15},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:403,columnNumber:13},this),t.jsxDEV("button",{onClick:()=>j(e=>({...e,cancelled:!e.cancelled})),className:`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${r.cancelled?"border-yellow-500 bg-yellow-50":"border-neutral-300 bg-neutral-100 opacity-50"}`,children:[t.jsxDEV("div",{className:`w-4 h-4 rounded ${r.cancelled?"bg-brand-yellow":"bg-neutral-400"}`},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:426,columnNumber:15},this),t.jsxDEV("span",{className:`text-sm font-medium ${r.cancelled?"text-neutral-700":"text-neutral-400"}`,children:"Cancelled"},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:429,columnNumber:15},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:418,columnNumber:13},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:387,columnNumber:11},this),U&&t.jsxDEV("div",{className:"absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center",children:t.jsxDEV("div",{className:"text-neutral-500",children:"Loading calendar events..."},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:437,columnNumber:15},this)},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:436,columnNumber:13},this),t.jsxDEV(I,{plugins:[z,G,K,B],headerToolbar:{left:"prev,next today",center:"title",right:"dayGridMonth,timeGridWeek,timeGridDay,listMonth"},initialView:"timeGridWeek",editable:!1,selectable:!1,selectMirror:!1,dayMaxEvents:3,moreLinkClick:"popover",weekends:!0,events:M,datesSet:_,eventClick:A,eventContent:T,height:"auto",contentHeight:"auto",eventDisplay:"block",lazyFetching:!0,eventTimeFormat:{hour:"numeric",minute:"2-digit",hour12:!0},slotMinTime:"06:00:00",slotMaxTime:"22:00:00",allDaySlot:!1,nowIndicator:!0,slotLabelFormat:{hour:"numeric",minute:"2-digit",hour12:!0},dayHeaderFormat:{weekday:"short"}},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:441,columnNumber:11},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:304,columnNumber:9},this),t.jsxDEV("div",{className:"text-sm text-neutral-500 italic",children:"Note: Completed or cancelled Lessons cannot be moved."},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:484,columnNumber:9},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:287,columnNumber:7},this),t.jsxDEV(Y,{lesson:$,isOpen:R,onClose:O},void 0,!1,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:489,columnNumber:7},this)]},void 0,!0,{fileName:"/Users/dougkvamme/Projects/portfolio-demos/ops-command-center/src/components/clubs/ClubCalendarContent.js",lineNumber:286,columnNumber:5},this)}export{ce as default};

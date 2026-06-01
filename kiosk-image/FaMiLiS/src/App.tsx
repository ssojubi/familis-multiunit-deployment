import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Session from "./pages/Session";
import SessionDetail from "./pages/SessionDetail";
import Survey from "./pages/Survey";

// new
// import Setup_Tester from "./pages/Setup_Tester";
// import Session_Tester from "./pages/Session_Tester";
// import Survey_Tester from "./pages/Survey_Tester";
import KioskHost from "./pages/KioskHost";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/session" element={<Session />} />
          <Route path="/session-detail" element={<SessionDetail />} />
          <Route path="/survey" element={<Survey />} />

          {/* new */}
          {/* <Route path="/setup_tester" element={<Setup_Tester />} />
          <Route path="/session_tester" element={<Session_Tester />} />
          <Route path="/survey_tester" element={<Survey_Tester />} /> */}
          <Route path="/kiosk" element={<KioskHost />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
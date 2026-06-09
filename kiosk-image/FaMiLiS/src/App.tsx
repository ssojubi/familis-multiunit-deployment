import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Session from "./pages/Session";
import SessionDetail from "./pages/SessionDetail";
import Survey from "./pages/Survey";
import Kiosk from "./pages/Kiosk";
// New tester routes
import TesterConsent from "./pages/TesterConsent";
import TesterSession from "./pages/TesterSession";
import TesterSurvey from "./pages/TesterSurvey";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route - login page */}
        <Route path="/" element={<Login />} />

        {/* Public kiosk routes — no login required; browser handles camera */}
        <Route path="/kiosk/setup" element={<Setup />} />
        <Route path="/kiosk/session" element={<Session />} />
        <Route path="/kiosk/survey" element={<Survey />} />

        {/* Protected routes - require authentication */}
        <Route element={<RequireAuth />}>
          {/* Admin routes */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/session" element={<Session />} />
          <Route path="/session-detail" element={<SessionDetail />} />
          <Route path="/survey" element={<Survey />} />
          ok
          <Route path="/kiosk" element={<Kiosk />} />
          {/* Tester routes */}
          <Route path="/tester-consent" element={<TesterConsent />} />
          <Route path="/tester-session" element={<TesterSession />} />
          <Route path="/tester-survey" element={<TesterSurvey />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

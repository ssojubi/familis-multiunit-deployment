import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./RequireAuth";
import RequireRole, { RequireTabAccess } from "./RequireRole";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Session from "./pages/Session";
import SessionDetail from "./pages/SessionDetail";
import Survey from "./pages/Survey";
import Consent from "./pages/Consent";
import Participants from "./pages/Participants";
import ParticipantDetail from "./pages/ParticipantDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminPreferences from "./pages/AdminPreferences";
import Signup from "./pages/Signup";
import VideoMonitoring from "./pages/VideoMonitoring";
import TesterJoin from "./pages/TesterJoin";
import TesterConsent from "./pages/TesterConsent";
import TesterSession from "./pages/TesterSession";
import TesterSurvey from "./pages/TesterSurvey";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<RequireAuth />}>
          {/* Tabs allowed by the user's role and Preferences configuration. */}
          <Route element={<RequireTabAccess />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/participants" element={<Participants />} />
            <Route path="/participants/:id" element={<ParticipantDetail />} />
            <Route path="/video-monitoring" element={<VideoMonitoring />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/preferences" element={<AdminPreferences />} />
          </Route>

          {/* Operator workflows */}
          <Route element={<RequireRole allowed={["admin", "staff"]} />}>
            <Route path="/setup" element={<Setup />} />
            <Route path="/session-detail" element={<SessionDetail />} />
          </Route>
          {/* Tester: consent gate only */}
          <Route element={<RequireRole allowed={["tester"]} />}>
            <Route path="/consent" element={<Consent />} />
          </Route>

          {/* Shared: live session + survey */}
          <Route element={<RequireRole allowed={["admin", "staff", "tester"]} />}>
            <Route path="/session" element={<Session />} />
            <Route path="/survey" element={<Survey />} />
            {/* Retained browser-kiosk routes keep the central FER/Socket.IO pipeline available. */}
            <Route path="/tester-join" element={<TesterJoin />} />
            <Route path="/tester-consent" element={<TesterConsent />} />
            <Route path="/tester-session" element={<TesterSession />} />
            <Route path="/tester-survey" element={<TesterSurvey />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

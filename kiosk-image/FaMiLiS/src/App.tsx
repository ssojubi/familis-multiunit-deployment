import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./RequireAuth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Session from "./pages/Session";
import SessionDetail from "./pages/SessionDetail";
import Survey from "./pages/Survey";
import VideoMonitoring from "./pages/VideoMonitoring";

import TesterConsent from "./pages/TesterConsent";
import TesterJoin from "./pages/TesterJoin";
import TesterSession from "./pages/TesterSession";
import TesterSurvey from "./pages/TesterSurvey";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route element={<RequireAuth />}>
          <Route path="/kiosk/setup" element={<Setup />} />
          <Route path="/kiosk/session" element={<Session />} />
          <Route path="/kiosk/survey" element={<Survey />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/session" element={<Session />} />
          <Route path="/session-detail" element={<SessionDetail />} />
          <Route path="/survey" element={<Survey />} />
          <Route path="/video-monitoring" element={<VideoMonitoring />} />
          
          <Route path="/tester-join" element={<TesterJoin />} />
          <Route path="/tester-consent" element={<TesterConsent />} />
          <Route path="/tester-session" element={<TesterSession />} />
          <Route path="/tester-survey" element={<TesterSurvey />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

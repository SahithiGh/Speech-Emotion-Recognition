import { Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Analyze from "./pages/Analyze";
import Evaluation from "./pages/Evaluation";
import About from "./pages/About";
import ModelInfoPage from "./pages/ModelInfoPage";
import Faq from "./pages/Faq";
import Contact from "./pages/Contact";
import { Privacy, Terms } from "./pages/Legal";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import { AuthProvider } from "./auth";
import { AnalysisProvider } from "./analysisContext";

export default function App() {
  const { pathname } = useLocation();
  return (
    <AuthProvider>
      <AnalysisProvider>
        <Layout>
          <ErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analyze" element={<Analyze />} />
            <Route path="/results" element={<Analyze />} />
            <Route path="/live" element={<Analyze />} />
            <Route path="/live-analysis" element={<Analyze />} />
            <Route path="/evaluation" element={<Evaluation />} />
            <Route path="/model" element={<ModelInfoPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signin" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/signup" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<Profile />} />
            <Route path="/settings" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </AnalysisProvider>
  </AuthProvider>
);
}

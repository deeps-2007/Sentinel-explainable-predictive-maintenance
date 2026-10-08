import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import FleetOverview from "./pages/FleetOverview.jsx";
import CsvUpload from "./pages/CsvUpload.jsx";
import MachinePrediction from "./pages/MachinePrediction.jsx";
import ShapExplanation from "./pages/ShapExplanation.jsx";
import WhatIfSimulator from "./pages/WhatIfSimulator.jsx";
import Recommendations from "./pages/Recommendations.jsx";
import MaintenanceTasks from "./pages/MaintenanceTasks.jsx";
import MaintenanceAnalytics from "./pages/MaintenanceAnalytics.jsx";
import ModelMonitoring from "./pages/ModelMonitoring.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/fleet" element={<ProtectedRoute><FleetOverview /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><CsvUpload /></ProtectedRoute>} />
          <Route path="/prediction" element={<ProtectedRoute><MachinePrediction /></ProtectedRoute>} />
          <Route path="/shap" element={<ProtectedRoute><ShapExplanation /></ProtectedRoute>} />
          <Route path="/whatif" element={<ProtectedRoute><WhatIfSimulator /></ProtectedRoute>} />
          <Route path="/recommendations" element={<ProtectedRoute><Recommendations /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute><MaintenanceTasks /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><MaintenanceAnalytics /></ProtectedRoute>} />
          <Route path="/monitoring" element={<ProtectedRoute><ModelMonitoring /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

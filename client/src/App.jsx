import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import { AdminLayout } from './components/AdminLayout.jsx';
import Landing from './pages/Landing.jsx';
import Choice from './pages/Choice.jsx';
import LoveQuestion from './pages/LoveQuestion.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminGifts from './pages/admin/Gifts.jsx';
import AdminParticipants from './pages/admin/Participants.jsx';
import AdminSettings from './pages/admin/Settings.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/choice" element={<Choice />} />
        <Route path="/love-question" element={<LoveQuestion />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="gifts" element={<AdminGifts />} />
          <Route path="participants" element={<AdminParticipants />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

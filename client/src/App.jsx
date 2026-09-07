import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import Landing from './pages/Landing.jsx';
import WheelPage from './pages/Wheel.jsx';
import Result from './pages/Result.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/wheel" element={<WheelPage />} />
        <Route path="/result" element={<Result />} />
      </Routes>
    </AppProvider>
  );
}

import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './state/AppContext.jsx';
import { SoundToggle } from './components/SoundToggle.jsx';
import Landing from './pages/Landing.jsx';

export default function App() {
  return (
    <AppProvider>
      <SoundToggle />
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </AppProvider>
  );
}

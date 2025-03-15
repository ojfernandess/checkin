import React, { useState, useEffect } from 'react';
import { Hash } from 'lucide-react';
import MD5 from 'crypto-js/md5';
import { CheckInSystem } from './components/CheckInSystem';

function App() {
  const [pin, setPin] = useState('');
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // The correct PIN is: 2025
  const correctHashedPin = "d5c186983b52c4551ee00f72316c6eaa";

  useEffect(() => {
    const storedExpiration = localStorage.getItem('pinExpiration');
    if (storedExpiration && Date.now() < parseInt(storedExpiration)) {
      setIsAuthenticated(true);
    }
  }, []);

  const hashPin = (pin: string): string => {
    return MD5(pin).toString();
  };

  const handlePinSubmit = () => {
    const hashedPin = hashPin(pin);

    if (hashedPin === correctHashedPin) {
      const expirationTime = Date.now() + 3600000; // 1 hour
      localStorage.setItem('pinExpiration', expirationTime.toString());
      setIsAuthenticated(true);
      setShowAccessDenied(false);
    } else {
      setShowAccessDenied(true);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handlePinSubmit();
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center mb-6">
            <Hash className="w-12 h-12 text-gray-700 mx-auto mb-2" />
            <h1 className="text-2xl font-bold text-gray-900">Acesso Restrito</h1>
          </div>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
                Digite o PIN para acessar:
              </label>
              <input
                type="password"
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="PIN de acesso"
              />
            </div>

            <button
              onClick={handlePinSubmit}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-200"
            >
              Entrar
            </button>

            {showAccessDenied && (
              <p className="text-red-600 text-sm mt-2">PIN incorreto. Tente novamente.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <CheckInSystem />;
}

export default App;
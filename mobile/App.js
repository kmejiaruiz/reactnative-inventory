import React, { useState } from 'react';
import { StyleSheet, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './screens/LoginScreen';
import AdminDashboard from './screens/AdminDashboard';
import ConsultorDashboard from './screens/ConsultorDashboard';
import VendedorDashboard from './screens/VendedorDashboard';

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (userToken, userData) => {
    setToken(userToken);
    setUser(userData);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
  };

  // Renderizado condicional basado en la autenticación y el rol
  const renderContent = () => {
    if (!token || !user) {
      return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }

    switch (user.rol) {
      case 'admin':
        return (
          <AdminDashboard
            token={token}
            user={user}
            onLogout={handleLogout}
          />
        );
      case 'consultor':
        return (
          <ConsultorDashboard
            token={token}
            user={user}
            onLogout={handleLogout}
          />
        );
      case 'vendedor':
        return (
          <VendedorDashboard
            token={token}
            user={user}
            onLogout={handleLogout}
          />
        );
      default:
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1e293b" />
        {renderContent()}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  }
});

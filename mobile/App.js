import React, { useState, useEffect } from 'react';
import { StyleSheet, StatusBar, View, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, setApiUrl } from './config';
import ApiSetupScreen from './screens/ApiSetupScreen';
import LoginScreen from './screens/LoginScreen';
import AdminDashboard from './screens/AdminDashboard';
import ConsultorDashboard from './screens/ConsultorDashboard';
import VendedorDashboard from './screens/VendedorDashboard';

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isApiConfigured, setIsApiConfigured] = useState(null); // null = loading, false = setup, true = login/dashboard
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    const checkSavedApi = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem('@api_url');
        if (savedUrl) {
          setApiUrl(savedUrl);
          setCurrentUrl(savedUrl);
          setIsApiConfigured(true);
        } else {
          setCurrentUrl(API_URL);
          setIsApiConfigured(false);
        }
      } catch (err) {
        console.log('Error leyendo AsyncStorage:', err);
        setIsApiConfigured(false);
      }
    };
    checkSavedApi();
  }, []);

  const handleConfigComplete = (configuredUrl) => {
    setCurrentUrl(configuredUrl);
    setIsApiConfigured(true);
  };

  const handleOpenConfig = () => {
    setIsApiConfigured(false);
  };

  const handleLoginSuccess = async (userToken, userData) => {
    setToken(userToken);
    setUser(userData);

    // Verificar si hay una alerta de restauración de base de datos pendiente
    try {
      const pendingRestoreAlert = await AsyncStorage.getItem('@pending_restore_alert');
      if (pendingRestoreAlert) {
        let formattedDate = pendingRestoreAlert;
        try {
          const dateObj = new Date(pendingRestoreAlert);
          if (!isNaN(dateObj.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            formattedDate = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
          }
        } catch (e) {}

        setTimeout(() => {
          Alert.alert(
            'Base de Datos Restaurada',
            `La base de datos fue restaurada a la versión del ${formattedDate}`,
            [{ text: 'Aceptar' }]
          );
        }, 500);

        await AsyncStorage.removeItem('@pending_restore_alert');
      }
    } catch (err) {
      console.log('Error al procesar la alerta de restauración de base de datos:', err);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
  };

  // Renderizado condicional basado en la configuración de la API, autenticación y el rol
  const renderContent = () => {
    if (isApiConfigured === null) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      );
    }

    if (!isApiConfigured) {
      return (
        <ApiSetupScreen
          onConfigComplete={handleConfigComplete}
          currentUrl={currentUrl}
        />
      );
    }

    if (!token || !user) {
      return (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onOpenConfig={handleOpenConfig}
        />
      );
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
        return (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onOpenConfig={handleOpenConfig}
          />
        );
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
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#070a13',
    justifyContent: 'center',
    alignItems: 'center'
  }
});

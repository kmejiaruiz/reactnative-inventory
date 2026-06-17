import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Por favor complete todos los campos.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 6000); // 6 segundos de tiempo de espera

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await response.json();
      setLoading(false);

      if (response.ok) {
        onLoginSuccess(data.token, data.usuario);
      } else {
        setErrorMsg(data.mensaje || 'Error en el inicio de sesión.');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      setLoading(false);
      console.log('Error de red:', error);
      
      let msg = 'No se pudo conectar con el servidor. Verifique la IP o su conexión de red.';
      if (error.name === 'AbortError') {
        msg = 'El servidor no responde (Tiempo de espera agotado).';
      }
      
      setErrorMsg(msg);
      Alert.alert(
        'Error de Conexión',
        `${msg}\n\nIntentando acceder a:\n${API_URL}/auth/login\n\nPor favor, asegúrese de que:\n1. El backend esté iniciado.\n2. La IP en "mobile/config.js" sea la dirección IP actual de su PC en la red Wi-Fi.`,
        [{ text: 'Entendido' }]
      );
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.loginCard}>
          <View style={styles.headerContainer}>
            <Ionicons name="shield-checkmark-sharp" size={48} color="#3b82f6" />
            <Text style={styles.title}>SISTEMA DE GESTIÓN</Text>
            <Text style={styles.subtitle}>Ingrese sus credenciales de acceso</Text>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color="#f87171" style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Correo Electrónico</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="ejemplo@sistema.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94a3b8"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>Cuentas de acceso de prueba:</Text>
            <Text style={styles.footerTextSub}>• admin@sistema.com (pass: admin123)</Text>
            <Text style={styles.footerTextSub}>• consultor@sistema.com (pass: consultor123)</Text>
            <Text style={styles.footerTextSub}>• vendedor@sistema.com (pass: vendedor123)</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 12,
    letterSpacing: 1
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center'
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 4,
    padding: 10,
    marginBottom: 16
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1
  },
  inputContainer: {
    marginBottom: 16
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    height: 48,
    paddingHorizontal: 12
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
    height: '100%'
  },
  eyeIcon: {
    padding: 4
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  },
  footerInfo: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center'
  },
  footerTextSub: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2
  }
});

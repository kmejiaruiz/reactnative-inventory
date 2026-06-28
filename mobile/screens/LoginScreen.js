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

export default function LoginScreen({ onLoginSuccess, onOpenConfig }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

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

  const handleQuickFill = (role) => {
    setErrorMsg('');
    if (role === 'admin') {
      setEmail('admin@sistema.com');
      setPassword('admin123');
    } else if (role === 'consultor') {
      setEmail('consultor@sistema.com');
      setPassword('consultor123');
    } else if (role === 'vendedor') {
      setEmail('vendedor@sistema.com');
      setPassword('vendedor123');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Decorative background glows */}
        <View style={styles.bgLightBlue} />
        <View style={styles.bgLightPurple} />

        <View style={styles.loginCard}>
          {/* Botón de configuración de API */}
          <TouchableOpacity 
            style={styles.settingsButton} 
            onPress={onOpenConfig}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={20} color="#64748b" />
          </TouchableOpacity>

          {/* Logo Brand Container */}
          <View style={styles.brandContainer}>
            <View style={styles.logoOuterCircle}>
              <View style={styles.logoInnerCircle}>
                <Ionicons name="wine" size={34} color="#3b82f6" />
              </View>
            </View>
            <Text style={styles.brandName}>LICOSTOCK</Text>
            <Text style={styles.brandTagline}>CONTROL CORPORATIVO DE INVENTARIO Y POS</Text>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color="#f87171" style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Email input field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Correo Electrónico</Text>
            <View style={[
              styles.inputWrapper, 
              isEmailFocused && styles.inputWrapperFocused
            ]}>
              <Ionicons 
                name="mail-outline" 
                size={18} 
                color={isEmailFocused ? '#3b82f6' : '#64748b'} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="ejemplo@sistema.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
              />
            </View>
          </View>

          {/* Password input field */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={[
              styles.inputWrapper, 
              isPasswordFocused && styles.inputWrapperFocused
            ]}>
              <Ionicons 
                name="lock-closed-outline" 
                size={18} 
                color={isPasswordFocused ? '#3b82f6' : '#64748b'} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#475569"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={isPasswordFocused ? '#3b82f6' : '#64748b'}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Session & Options */}
          <View style={styles.optionsRow}>
            <TouchableOpacity 
              style={styles.checkboxRow} 
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.8}
            >
              <Ionicons 
                name={rememberMe ? "checkbox" : "square-outline"} 
                size={18} 
                color={rememberMe ? "#3b82f6" : "#64748b"} 
                style={{ marginRight: 6 }}
              />
              <Text style={styles.checkboxLabel}>Recordar sesión</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => Alert.alert('Ayuda', 'Si no recuerda sus credenciales, contacte al administrador del sistema en soporte@licostock.com.')}>
              <Text style={styles.forgotText}>¿Necesita ayuda?</Text>
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>Acceder al Sistema</Text>
                <Ionicons name="chevron-forward-outline" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
              </View>
            )}
          </TouchableOpacity>

          {/* Quick Access panel */}
          <View style={styles.quickAccessContainer}>
            <Text style={styles.quickAccessTitle}>Acceso Rápido (Demostración)</Text>
            <Text style={styles.quickAccessSubtitle}>Toca una cuenta para auto-completar:</Text>
            
            <View style={styles.quickBadgesRow}>
              <TouchableOpacity 
                style={[styles.quickBadge, styles.badgeAdmin]} 
                onPress={() => handleQuickFill('admin')}
              >
                <Ionicons name="key" size={11} color="#3b82f6" style={{ marginRight: 4 }} />
                <Text style={styles.quickBadgeText}>Admin</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.quickBadge, styles.badgeConsultor]} 
                onPress={() => handleQuickFill('consultor')}
              >
                <Ionicons name="shield" size={11} color="#c084fc" style={{ marginRight: 4 }} />
                <Text style={styles.quickBadgeText}>Auditor</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.quickBadge, styles.badgeVendedor]} 
                onPress={() => handleQuickFill('vendedor')}
              >
                <Ionicons name="cart" size={11} color="#34d399" style={{ marginRight: 4 }} />
                <Text style={styles.quickBadgeText}>Vendedor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  bgLightBlue: {
    position: 'absolute',
    top: 50,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  bgLightPurple: {
    position: 'absolute',
    bottom: 50,
    right: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(168, 85, 247, 0.03)',
  },
  loginCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 26
  },
  logoOuterCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 5
  },
  logoInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 12,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  brandTagline: {
    fontSize: 10,
    color: '#475569',
    marginTop: 5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center'
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.18)',
    borderRadius: 6,
    padding: 12,
    marginBottom: 20
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1,
    fontWeight: '500'
  },
  inputContainer: {
    marginBottom: 18
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12
  },
  inputWrapperFocused: {
    borderColor: '#3b82f6',
    borderWidth: 1.2,
    backgroundColor: '#0b111e'
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    height: '100%'
  },
  eyeIcon: {
    padding: 6
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 2
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600'
  },
  forgotText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600'
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  quickAccessContainer: {
    marginTop: 26,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 20,
    alignItems: 'center'
  },
  quickAccessTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4
  },
  quickAccessSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 12
  },
  quickBadgesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8
  },
  quickBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#0a0f1d'
  },
  badgeAdmin: {
    borderColor: 'rgba(59, 130, 246, 0.15)',
  },
  badgeConsultor: {
    borderColor: 'rgba(168, 85, 247, 0.15)',
  },
  badgeVendedor: {
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  quickBadgeText: {
    fontSize: 10,
    color: '#cbd5e1',
    fontWeight: '700'
  },
  settingsButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
    zIndex: 10
  }
});

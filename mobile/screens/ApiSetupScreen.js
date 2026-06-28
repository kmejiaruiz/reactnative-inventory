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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiUrl } from '../config';

export default function ApiSetupScreen({ onConfigComplete, currentUrl }) {
  const [urlInput, setUrlInput] = useState(currentUrl || 'http://192.168.1.103:5000');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isUrlFocused, setIsUrlFocused] = useState(false);

  const handleValidateAndSave = async () => {
    let cleanUrl = urlInput.trim();
    if (!cleanUrl) {
      setErrorMsg('Por favor ingrese la URL de la API.');
      return;
    }
    // Quitar diagonal final si existe
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    
    // Validar formato básico
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setErrorMsg('La URL debe comenzar con http:// o https://');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 5000); // 5s timeout

    try {
      // Intentar conectarse a la ruta de health check
      const checkPath = cleanUrl.endsWith('/api') ? `${cleanUrl}/health` : `${cleanUrl}/api/health`;
      const response = await fetch(checkPath, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await response.json();
      setLoading(false);

      if (response.ok && data.status === 'ok') {
        // Asegurarse de almacenar con /api al final
        let finalUrl = cleanUrl;
        if (!finalUrl.endsWith('/api')) {
          finalUrl = `${finalUrl}/api`;
        }

        // Guardar en AsyncStorage
        await AsyncStorage.setItem('@api_url', finalUrl);
        // Actualizar la variable en memoria de config.js
        setApiUrl(finalUrl);
        
        setSuccessMsg('¡Conexión establecida con éxito!');
        setTimeout(() => {
          onConfigComplete(finalUrl);
        }, 800);
      } else {
        setErrorMsg('El servidor respondió pero no es un endpoint válido de LICOSTOCK.');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      setLoading(false);
      console.log('Error de validación de API:', error);
      let errMsg = 'No se pudo conectar con el servidor. Verifique la dirección IP e intente de nuevo.';
      if (error.name === 'AbortError') {
        errMsg = 'Tiempo de espera agotado. El servidor no responde.';
      }
      setErrorMsg(errMsg);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.bgLightBlue} />
        <View style={styles.bgLightPurple} />

        <View style={styles.card}>
          <View style={styles.brandContainer}>
            <View style={styles.logoOuterCircle}>
              <View style={styles.logoInnerCircle}>
                <Ionicons name="settings-sharp" size={32} color="#3b82f6" />
              </View>
            </View>
            <Text style={styles.brandName}>Configuración de API</Text>
            <Text style={styles.brandTagline}>LICOSTOCK PRODUCCIÓN</Text>
          </View>

          <Text style={styles.instructions}>
            Ingrese la dirección IP y puerto del servidor backend en su red local o el dominio de producción:
          </Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color="#f87171" style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#34d399" style={{ marginRight: 8 }} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>URL Base de la API</Text>
            <View style={[
              styles.inputWrapper,
              isUrlFocused && styles.inputWrapperFocused
            ]}>
              <Ionicons
                name="link-outline"
                size={18}
                color={isUrlFocused ? '#3b82f6' : '#64748b'}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="http://192.168.1.103:5000"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={urlInput}
                onChangeText={(text) => {
                  setUrlInput(text);
                  setErrorMsg('');
                }}
                onFocus={() => setIsUrlFocused(true)}
                onBlur={() => setIsUrlFocused(false)}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleValidateAndSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>Probar Conexión y Guardar</Text>
                <Ionicons name="cloud-upload-outline" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
              </View>
            )}
          </TouchableOpacity>
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
  card: {
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
    marginBottom: 20
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
    letterSpacing: 0.5,
    textAlign: 'center'
  },
  brandTagline: {
    fontSize: 10,
    color: '#3b82f6',
    marginTop: 5,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center'
  },
  instructions: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20
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
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.18)',
    borderRadius: 6,
    padding: 12,
    marginBottom: 20
  },
  successText: {
    color: '#34d399',
    fontSize: 13,
    flex: 1,
    fontWeight: '500'
  },
  inputContainer: {
    marginBottom: 22
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
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
  }
});

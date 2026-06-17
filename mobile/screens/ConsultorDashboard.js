import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../config';

export default function ConsultorDashboard({ token, user, onLogout }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('conteos'); // 'conteos', 'perfil'
  const [conteoAutorizado, setConteoAutorizado] = useState(true);

  // Auditoría e Inventario
  const [counts, setCounts] = useState([]);
  const [categorias, setCategorias] = useState([]);
  
  // Detalle de Conteo Activo
  const [activeCount, setActiveCount] = useState(null); // Conteo ID seleccionado
  const [activeCountDetails, setActiveCountDetails] = useState(null); // { header, items }
  const [countedValues, setCountedValues] = useState({}); // Map: prodId -> string
  const [showNewCountModal, setShowNewCountModal] = useState(false);
  const [newCountCategory, setNewCountCategory] = useState(null);
  const [submittingStart, setSubmittingStart] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // Verificación de credenciales
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [applyEmail, setApplyEmail] = useState(user.email || '');
  const [applyPassword, setApplyPassword] = useState('');
  const [submittingApply, setSubmittingApply] = useState(false);

  const fetchConsultorData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/dashboard/consultor`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (response.ok) {
        setData(resData);
        setCategorias(resData.categorias || []);
        setCounts(resData.conteos || []);
        setConteoAutorizado(resData.conteoAutorizado !== undefined ? resData.conteoAutorizado : true);
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo obtener datos del servidor.');
      }
    } catch (error) {
      console.log('Error al obtener datos consultor:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultorData();
  }, []);

  const handleOpenCountDetails = async (countId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/inventory-counts/${countId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoading(false);
      if (response.ok) {
        setActiveCount(countId);
        setActiveCountDetails(resData);
        
        // Cargar valores existentes del borrador
        const vals = {};
        resData.items.forEach(item => {
          vals[item.producto_id] = item.cantidad_contada !== null ? item.cantidad_contada.toString() : '';
        });
        setCountedValues(vals);
      } else {
        Alert.alert('Error', 'No se pudo obtener el detalle del conteo.');
      }
    } catch (error) {
      setLoading(false);
      console.log('Error al abrir detalle conteo:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };

  const handleStartCount = async () => {
    if (!newCountCategory) {
      Alert.alert('Falta Categoría', 'Seleccione una categoría para el conteo.');
      return;
    }
    setSubmittingStart(true);
    try {
      const response = await fetch(`${API_URL}/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ categoria_id: newCountCategory })
      });
      const resData = await response.json();
      setSubmittingStart(false);

      if (response.ok) {
        Alert.alert('Éxito', 'Conteo de inventario iniciado.');
        setShowNewCountModal(false);
        fetchConsultorData();
        // Abrir detalles del conteo recién creado automáticamente
        handleOpenCountDetails(resData.countId);
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo iniciar el conteo.');
      }
    } catch (error) {
      setSubmittingStart(false);
      console.log('Error al iniciar conteo:', error);
      Alert.alert('Error de red', 'No se pudo registrar la operación.');
    }
  };

  const handleSaveDraft = async () => {
    const itemsToSubmit = [];
    activeCountDetails.items.forEach(item => {
      const val = countedValues[item.producto_id];
      itemsToSubmit.push({
        producto_id: item.producto_id,
        cantidad_contada: val.trim() !== '' ? parseInt(val) : null
      });
    });

    setSubmittingDraft(true);
    try {
      const response = await fetch(`${API_URL}/inventory-counts/${activeCount}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: itemsToSubmit })
      });
      setSubmittingDraft(false);

      if (response.ok) {
        Alert.alert('Éxito', 'Borrador de conteo guardado correctamente.');
        handleOpenCountDetails(activeCount); // Refrescar detalles
      } else {
        const resData = await response.json();
        Alert.alert('Error', resData.mensaje || 'No se pudo guardar el borrador.');
      }
    } catch (error) {
      setSubmittingDraft(false);
      console.log('Error al guardar borrador:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };

  // Enviar a verificación
  const handleOpenApplyVerification = () => {
    // Verificar que todos los campos del conteo estén llenos
    let complete = true;
    activeCountDetails.items.forEach(item => {
      const val = countedValues[item.producto_id];
      if (val === undefined || val === null || val.trim() === '') {
        complete = false;
      }
    });

    if (!complete) {
      Alert.alert('Conteo Incompleto', 'Debe rellenar el conteo físico de todos los productos antes de aplicar a producción.');
      return;
    }

    setApplyPassword('');
    setApplyModalVisible(true);
  };

  const handleApplyToProduction = async () => {
    if (!applyEmail.trim() || !applyPassword.trim()) {
      Alert.alert('Campos Obligatorios', 'Ingrese su correo y contraseña.');
      return;
    }

    setSubmittingApply(true);
    try {
      // 1. Guardar primero el borrador actual para asegurar que se aplique lo último en pantalla
      const itemsToSubmit = [];
      activeCountDetails.items.forEach(item => {
        const val = countedValues[item.producto_id];
        itemsToSubmit.push({
          producto_id: item.producto_id,
          cantidad_contada: val.trim() !== '' ? parseInt(val) : null
        });
      });

      await fetch(`${API_URL}/inventory-counts/${activeCount}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: itemsToSubmit })
      });

      // 2. Aplicar con credenciales de consultor
      const response = await fetch(`${API_URL}/inventory-counts/${activeCount}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: applyEmail.trim(),
          password: applyPassword.trim()
        })
      });

      const resData = await response.json();
      setSubmittingApply(false);

      if (response.ok) {
        Alert.alert(
          'Conteo Aplicado a Producción',
          '✅ Éxito.\nEl conteo ha sido verificado y las existencias reales en producción han sido actualizadas.'
        );
        setApplyModalVisible(false);
        setActiveCount(null);
        setActiveCountDetails(null);
        fetchConsultorData();
      } else {
        Alert.alert('Autorización Rechazada', resData.mensaje || 'Credenciales inválidas o incompletas.');
      }
    } catch (error) {
      setSubmittingApply(false);
      console.log('Error al aplicar conteo:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };

  if (loading && !showNewCountModal && !applyModalVisible) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Cargando panel de conteo...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Auditoría de Inventario</Text>
          <Text style={styles.headerSubtitle}>Bienvenido, {user.nombre}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color="#f87171" />
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        
        {/* TAB 1: LISTADO Y FORMULARIO DE CONTEOS */}
        {activeTab === 'conteos' && !activeCountDetails && (
          <View>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Conteos de Inventario</Text>
              <TouchableOpacity
                style={[styles.createButton, !conteoAutorizado && styles.createButtonDisabled]}
                onPress={() => {
                  if (!conteoAutorizado) {
                    Alert.alert('Acceso Denegado', 'No ha sido autorizado por su administrador para realizar conteos.');
                    return;
                  }
                  if (categorias.length > 0) {
                    setNewCountCategory(categorias[0].id);
                  }
                  setShowNewCountModal(true);
                }}
              >
                <Ionicons name="add-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.createButtonText}>Iniciar Conteo</Text>
              </TouchableOpacity>
            </View>

            {counts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No hay auditorías registradas en este período.</Text>
              </View>
            ) : (
              counts.map((item) => (
                <View key={item.id} style={styles.countCard}>
                  <View style={styles.countCardHeader}>
                    <View>
                      <Text style={styles.countCardTitle}>Auditoría #{item.id}</Text>
                      <Text style={styles.countCardCategory}>Categoría: {item.categoria_nombre}</Text>
                    </View>
                    <View style={[styles.statusBadge, styles[`statusBadge_${item.estado}`]]}>
                      <Text style={[styles.statusBadgeText, styles[`statusBadgeText_${item.estado}`]]}>
                        {item.estado.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.countCardMeta}>
                    <Text style={styles.countMetaText}>Iniciado: {new Date(item.fecha_creacion).toLocaleDateString('es-ES')}</Text>
                    {item.fecha_aplicado && (
                      <Text style={styles.countMetaText}>Aplicado: {new Date(item.fecha_aplicado).toLocaleDateString('es-ES')}</Text>
                    )}
                    <Text style={styles.countMetaText}>Auditor: {item.consultor_nombre}</Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.viewDetailsButton,
                      (item.estado === 'borrador' && !conteoAutorizado) && styles.viewDetailsButtonDisabled
                    ]}
                    onPress={() => {
                      if (item.estado === 'borrador' && !conteoAutorizado) {
                        Alert.alert('Acceso Denegado', 'No ha sido autorizado por su administrador para realizar conteos.');
                        return;
                      }
                      handleOpenCountDetails(item.id);
                    }}
                  >
                    <Ionicons
                      name={item.estado === 'borrador' && !conteoAutorizado ? 'lock-closed-outline' : 'eye-outline'}
                      size={16}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.viewDetailsButtonText}>
                      {item.estado === 'borrador'
                        ? (!conteoAutorizado ? 'Acceso Bloqueado' : 'Ingresar Conteos / Reporte')
                        : 'Ver Reporte de Diferencias'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* DETALLE DEL CONTEO ACTIVO (Reporte Imprimible e Ingreso de Datos) */}
        {activeTab === 'conteos' && activeCountDetails && (
          <View>
            <TouchableOpacity style={styles.backButton} onPress={() => {
              setActiveCount(null);
              setActiveCountDetails(null);
              fetchConsultorData();
            }}>
              <Ionicons name="arrow-back-outline" size={18} color="#10b981" style={{ marginRight: 6 }} />
              <Text style={styles.backButtonText}>Volver a la Lista</Text>
            </TouchableOpacity>

            <View style={styles.activeHeaderCard}>
              <Text style={styles.activeHeaderTitle}>Inventario #{activeCountDetails.header.id}</Text>
              <Text style={styles.activeHeaderSub}>
                Categoría: <Text style={{ fontWeight: 'bold', color: '#10b981' }}>{activeCountDetails.header.categoria_nombre}</Text>
              </Text>
              <Text style={styles.activeHeaderSub}>
                Estado: {activeCountDetails.header.estado.toUpperCase()}
              </Text>
            </View>

            {/* SECCIÓN 1: REPORTE IMPRIMIBLE (Hoja de Trabajo Físico) */}
            <Text style={styles.sectionTitle}>1. Hoja de Trabajo Físico (Reporte Imprimible)</Text>
            <View style={styles.printSheet}>
              <View style={styles.printSheetHeader}>
                <Text style={styles.printSheetTitle}>HOJA DE TRABAJO - CONTROL DE INVENTARIO</Text>
                <Text style={styles.printSheetMeta}>Licorería | Auditoría #{activeCountDetails.header.id}</Text>
                <Text style={styles.printSheetMeta}>Categoría: {activeCountDetails.header.categoria_nombre}</Text>
                <Text style={styles.printSheetMeta}>Fecha: {new Date(activeCountDetails.header.fecha_creacion).toLocaleDateString('es-ES')}</Text>
                <Text style={styles.printSheetMeta}>Auditor: {user.nombre}</Text>
              </View>

              <View style={styles.printTableHead}>
                <Text style={[styles.printTableCol, { flex: 2, fontWeight: 'bold' }]}>Producto / Licor</Text>
                <Text style={[styles.printTableCol, { flex: 1, fontWeight: 'bold', textAlign: 'center' }]}>Conteo Físico</Text>
              </View>
              {activeCountDetails.items.map((item) => (
                <View key={item.producto_id} style={styles.printTableRow}>
                  <Text style={[styles.printTableRowText, { flex: 2 }]}>{item.producto_nombre}</Text>
                  <Text style={[styles.printTableRowText, { flex: 1, textAlign: 'center', color: '#64748b' }]}>
                    [  _ _ _ _  ]
                  </Text>
                </View>
              ))}

              <View style={styles.printSheetFooter}>
                <Text style={styles.printSheetSignLine}>Firma Auditor: _________________________</Text>
              </View>
            </View>
            
            <View style={{ height: 16 }} />

            {/* SECCIÓN 2: CAPTURA DE CONTEO EN SISTEMA */}
            <Text style={styles.sectionTitle}>2. Transcribir Conteo Físico al Sistema</Text>
            <View style={styles.panel}>
              {activeCountDetails.items.map((item) => {
                const isBorrador = activeCountDetails.header.estado === 'borrador';
                const hasDiferencia = item.diferencia !== null;
                
                return (
                  <View key={item.producto_id} style={styles.captureProductRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.captureProductName}>{item.producto_nombre}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 4 }}>
                        <Text style={styles.captureProductSub}>
                          Stock Sistema: <Text style={{ fontWeight: 'bold' }}>{item.cantidad_sistema}</Text>
                        </Text>
                        {!isBorrador && (
                          <Text style={[styles.captureProductSub, { marginLeft: 12 }]}>
                            Contado: <Text style={{ fontWeight: 'bold' }}>{item.cantidad_contada}</Text>
                          </Text>
                        )}
                      </View>
                      
                      {/* Mostrar diferencia si el conteo no es borrador */}
                      {hasDiferencia && (
                        <Text style={[
                          styles.diffLabel,
                          item.diferencia === 0 ? styles.diffZero : (item.diferencia < 0 ? styles.diffNegative : styles.diffPositive)
                        ]}>
                          Diferencia: {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia} u.
                        </Text>
                      )}
                    </View>

                    {isBorrador && (
                      <View style={styles.inputValContainer}>
                        <TextInput
                          style={styles.captureInput}
                          keyboardType="numeric"
                          value={countedValues[item.producto_id] || ''}
                          onChangeText={(val) => {
                            const updated = { ...countedValues };
                            updated[item.producto_id] = val;
                            setCountedValues(updated);
                          }}
                          placeholder="Unidades"
                          placeholderTextColor="#475569"
                        />
                      </View>
                    )}
                  </View>
                );
              })}

              {activeCountDetails.header.estado === 'borrador' && (
                <View style={styles.countActionsRow}>
                  <TouchableOpacity style={styles.saveDraftButton} onPress={handleSaveDraft} disabled={submittingDraft}>
                    {submittingDraft ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.saveDraftButtonText}>Guardar Borrador</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.applyCountButton} onPress={handleOpenApplyVerification} disabled={submittingDraft}>
                    <Ionicons name="cloud-upload-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.applyCountButtonText}>Aplicar a Producción</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* TAB 2: MI PERFIL */}
        {activeTab === 'perfil' && (
          <View style={styles.profilePanel}>
            <Text style={styles.profileTitle}>Perfil del Colaborador</Text>
            
            <View style={styles.avatarContainer}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={50} color="#10b981" />
              </View>
              <Text style={styles.profileNameText}>{user.nombre}</Text>
              <Text style={styles.profileRoleText}>Consultor / Auditor Interno</Text>
            </View>

            <View style={styles.profileDetailBox}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Correo:</Text>
                <Text style={styles.profileValue}>{user.email || 'consultor@sistema.com'}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Rol Asignado:</Text>
                <Text style={styles.profileValue}>Consultor Técnico de Inventario</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Permisos:</Text>
                <Text style={styles.profileValue}>Auditoría física de almacén</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>ID de Empleado:</Text>
                <Text style={styles.profileValue}>COLAB-00{user.id || 2}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutProfileButton} onPress={onLogout}>
              <Ionicons name="log-out" size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.logoutProfileButtonText}>Cerrar Sesión Segura</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* BOTTOM TAB BAR */}
      <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'conteos' && styles.tabBarButtonActive]}
          onPress={() => {
            setActiveCount(null);
            setActiveCountDetails(null);
            setActiveTab('conteos');
            fetchConsultorData();
          }}
        >
          <Ionicons
            name={activeTab === 'conteos' ? 'clipboard' : 'clipboard-outline'}
            size={20}
            color={activeTab === 'conteos' ? '#10b981' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'conteos' && styles.tabBarTextActive]}>Conteos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'perfil' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('perfil')}
        >
          <Ionicons
            name={activeTab === 'perfil' ? 'person' : 'person-outline'}
            size={20}
            color={activeTab === 'perfil' ? '#10b981' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'perfil' && styles.tabBarTextActive]}>Mi Perfil</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL INICIAR NUEVA AUDITORÍA */}
      <Modal
        visible={showNewCountModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNewCountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Iniciar Auditoría Física</Text>
              <TouchableOpacity onPress={() => setShowNewCountModal(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Seleccione Categoría a Conectar:</Text>
                <View style={styles.pickerSelector}>
                  {categorias.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.pickerItem, newCountCategory === cat.id && styles.pickerItemActive]}
                      onPress={() => setNewCountCategory(cat.id)}
                    >
                      <Text style={styles.pickerItemText}>{cat.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.submitButtonStart}
                onPress={handleStartCount}
                disabled={submittingStart}
              >
                {submittingStart ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Iniciar Conteo de Categoría</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL DE AUTORIZACIÓN (EMAIL Y CONTRASEÑA DE CONSULTOR) */}
      <Modal
        visible={applyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setApplyModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Autorizar Ajuste Inventario</Text>
              <TouchableOpacity onPress={() => setApplyModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={22} color="#fbbf24" style={{ marginRight: 8 }} />
                <Text style={styles.warningText}>
                  ⚠️ ADVERTENCIA: Esta acción actualizará de forma definitiva las existencias en producción.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Correo del Consultor</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: '#334155', color: '#94a3b8' }]}
                  value={applyEmail}
                  editable={false} // Mantener pre-llenado bloqueado
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Contraseña del Consultor</Text>
                <TextInput
                  style={styles.formInput}
                  secureTextEntry={true}
                  value={applyPassword}
                  onChangeText={setApplyPassword}
                  placeholder="Ingrese contraseña de consultor"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={styles.applyConfirmButton}
                onPress={handleApplyToProduction}
                disabled={submittingApply}
              >
                {submittingApply ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="lock-open-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.applyConfirmButtonText}>Firmar y Aplicar Inventario</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 15
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderColor: '#334155'
  },
  headerInfo: {
    flex: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc'
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  logoutText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6
  },
  content: {
    flex: 1,
    padding: 16
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 8
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc'
  },
  panelTitleForm: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center'
  },
  countCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  countCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 8,
    marginBottom: 10
  },
  countCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc'
  },
  countCardCategory: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 2,
    fontWeight: '600'
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1
  },
  statusBadge_borrador: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  statusBadgeText_borrador: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: 'bold'
  },
  statusBadge_aplicado: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  statusBadgeText_aplicado: {
    color: '#34d399',
    fontSize: 9,
    fontWeight: 'bold'
  },
  countCardMeta: {
    marginBottom: 12
  },
  countMetaText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 8
  },
  viewDetailsButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  backButtonText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700'
  },
  activeHeaderCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16
  },
  activeHeaderTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700'
  },
  activeHeaderSub: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  printSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  printSheetHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 10,
    marginBottom: 12
  },
  printSheetTitle: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center'
  },
  printSheetMeta: {
    color: '#334155',
    fontSize: 11,
    marginTop: 2
  },
  printTableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    paddingBottom: 6,
    marginBottom: 6
  },
  printTableCol: {
    color: '#000000',
    fontSize: 11
  },
  printTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8
  },
  printTableRowText: {
    color: '#000000',
    fontSize: 12
  },
  printSheetFooter: {
    marginTop: 20,
    paddingTop: 10,
    alignItems: 'flex-start'
  },
  printSheetSignLine: {
    color: '#000000',
    fontSize: 11,
    marginTop: 10
  },
  panel: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16
  },
  captureProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  captureProductName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  captureProductSub: {
    color: '#94a3b8',
    fontSize: 11
  },
  diffLabel: {
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start'
  },
  diffZero: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    color: '#34d399'
  },
  diffNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171'
  },
  diffPositive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: '#60a5fa'
  },
  inputValContainer: {
    width: 90
  },
  captureInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 4,
    height: 36,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 14
  },
  countActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14
  },
  saveDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#475569'
  },
  saveDraftButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  applyCountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  applyCountButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  profilePanel: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  profileTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  avatarContainer: {
    alignItems: 'center',
    marginVertical: 16
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10b981',
    marginBottom: 12
  },
  profileNameText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc'
  },
  profileRoleText: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 2,
    fontWeight: '600'
  },
  profileDetailBox: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#1e293b'
  },
  profileLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600'
  },
  profileValue: {
    fontSize: 13,
    color: '#f8fafc',
    fontWeight: '500'
  },
  logoutProfileButton: {
    flexDirection: 'row',
    backgroundColor: '#ef4444',
    height: 44,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoutProfileButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderColor: '#334155',
    paddingTop: 8,
    paddingBottom: 8
  },
  tabBarButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabBarButtonActive: {
    borderTopWidth: 2,
    borderColor: '#10b981'
  },
  tabBarText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500'
  },
  tabBarTextActive: {
    color: '#10b981',
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 20
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '90%'
  },
  modalContentCenter: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    width: '90%',
    maxWidth: 360
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 8
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc'
  },
  formGroup: {
    marginBottom: 16
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6
  },
  formInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    height: 44,
    paddingHorizontal: 12,
    color: '#f8fafc',
    fontSize: 14
  },
  pickerSelector: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 8
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  pickerItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)'
  },
  pickerItemText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600'
  },
  submitButtonStart: {
    flexDirection: 'row',
    backgroundColor: '#10b981',
    borderRadius: 6,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16
  },
  warningText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    flex: 1
  },
  applyConfirmButton: {
    flexDirection: 'row',
    backgroundColor: '#ef4444',
    height: 44,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10
  },
  applyConfirmButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  createButtonDisabled: {
    backgroundColor: '#475569',
    opacity: 0.6
  },
  viewDetailsButtonDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6
  }
});

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
  Alert,
  FlatList,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../config';
import ConsultorDashboard from './ConsultorDashboard';
import VendedorDashboard from './VendedorDashboard';

export default function AdminDashboard({ token, user, onLogout }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'compras', 'usuarios', 'bitacora', 'simulador'

  // Estados para simulación de otros roles
  const [simulatedRole, setSimulatedRole] = useState(null);

  // Estados para CRUD de usuarios
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRol, setFormRol] = useState('vendedor');
  const [submittingUser, setSubmittingUser] = useState(false);

  // Estados para Órdenes de Compra
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [debitNotes, setDebitNotes] = useState([]);
  const [poCatalog, setPoCatalog] = useState([]);
  const [poModalVisible, setPoModalVisible] = useState(false);
  const [poProveedor, setPoProveedor] = useState('');
  const [poItems, setPoItems] = useState([]); // Array: { producto_id, producto_nombre, cantidad_ordenada, costo_unitario }
  
  // Agregar item a PO
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [poItemQty, setPoItemQty] = useState('1');
  const [poItemCost, setPoItemCost] = useState('');
  const [submittingPo, setSubmittingPo] = useState(false);

  // Recepción de Órdenes (Dar Entrada)
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [receivingPo, setReceivingPo] = useState(null);
  const [receivingItems, setReceivingItems] = useState([]); // Array de items de PO para recibir
  const [receivingFactura, setReceivingFactura] = useState('');
  const [receivedQuantities, setReceivedQuantities] = useState({}); // Map: prodId -> string
  const [submittingReceive, setSubmittingReceive] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/dashboard/admin`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (response.ok) {
        setData(resData);
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo obtener datos del panel.');
      }

      // Obtener catálogo para Órdenes de Compra
      const prodResponse = await fetch(`${API_URL}/productos/search`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (prodResponse.ok) {
        const prodData = await prodResponse.json();
        setPoCatalog(prodData);
      }

      // Obtener órdenes de compra
      const poResponse = await fetch(`${API_URL}/purchase-orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (poResponse.ok) {
        const poData = await poResponse.json();
        setPurchaseOrders(poData);
      }

      // Obtener notas de débito
      const dnResponse = await fetch(`${API_URL}/debit-notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (dnResponse.ok) {
        const dnData = await dnResponse.json();
        setDebitNotes(dnData);
      }

    } catch (error) {
      console.log('Error al obtener datos del servidor:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormNombre('');
    setFormEmail('');
    setFormPassword('');
    setFormRol('vendedor');
    setUserModalVisible(true);
  };

  const openEditModal = (targetUser) => {
    setEditingUser(targetUser);
    setFormNombre(targetUser.nombre);
    setFormEmail(targetUser.email);
    setFormPassword('');
    setFormRol(targetUser.rol);
    setUserModalVisible(true);
  };

  const handleSaveUser = async () => {
    if (!formNombre.trim() || !formEmail.trim() || (!editingUser && !formPassword.trim())) {
      Alert.alert('Datos Incompletos', 'Por favor complete todos los campos obligatorios.');
      return;
    }

    setSubmittingUser(true);
    const url = editingUser ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;
    const method = editingUser ? 'PUT' : 'POST';
    const body = {
      nombre: formNombre.trim(),
      email: formEmail.trim().toLowerCase(),
      rol: formRol,
      ...(formPassword.trim() !== '' && { password: formPassword.trim() })
    };

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const resData = await response.json();
      setSubmittingUser(false);

      if (response.ok) {
        Alert.alert('Éxito', resData.mensaje || 'Operación realizada con éxito.');
        setUserModalVisible(false);
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo guardar el usuario.');
      }
    } catch (error) {
      setSubmittingUser(false);
      console.log('Error al guardar usuario:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const handleToggleConteoAuth = async (targetUser) => {
    try {
      const response = await fetch(`${API_URL}/users/${targetUser.id}/toggle-conteo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const resData = await response.json();
      if (response.ok) {
        Alert.alert('Éxito', resData.mensaje || 'Permiso actualizado.');
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo actualizar el permiso.');
      }
    } catch (error) {
      console.log('Error al actualizar permiso de conteo:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const handleDeleteUser = (targetUser) => {
    if (targetUser.id === user.id) {
      Alert.alert('Acción Denegada', 'No puedes eliminar tu propio usuario.');
      return;
    }

    Alert.alert(
      'Confirmar Eliminación',
      `¿Está seguro de que desea eliminar al usuario "${targetUser.nombre}"?\nEsta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/users/${targetUser.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });

              const resData = await response.json();
              if (response.ok) {
                Alert.alert('Éxito', 'El usuario ha sido eliminado.');
                fetchDashboardData();
              } else {
                Alert.alert('Error', resData.mensaje || 'No se pudo eliminar el usuario.');
              }
            } catch (error) {
              console.log('Error al eliminar usuario:', error);
              Alert.alert('Error de red', 'No se pudo conectar al servidor.');
            }
          }
        }
      ]
    );
  };

  // Lógica de Órdenes de Compra
  const handleOpenPoModal = () => {
    setPoProveedor('');
    setPoItems([]);
    setPoModalVisible(true);
  };

  const handleOpenAddItem = () => {
    if (poCatalog.length === 0) {
      Alert.alert('Catálogo Vacío', 'No hay productos en catálogo.');
      return;
    }
    setSelectedProduct(poCatalog[0]);
    setPoItemQty('1');
    setPoItemCost(poCatalog[0].precio.toString());
    setAddItemModalVisible(true);
  };

  const handleAddPoItem = () => {
    if (!selectedProduct) return;
    const qty = parseInt(poItemQty);
    const cost = parseFloat(poItemCost);

    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) {
      Alert.alert('Valores Inválidos', 'La cantidad y el costo deben ser números mayores a cero.');
      return;
    }

    // Verificar si ya existe el producto en los items agregados
    const exists = poItems.some(item => item.producto_id === selectedProduct.id);
    if (exists) {
      Alert.alert('Duplicado', 'El producto ya está en la orden de compra.');
      return;
    }

    const newItem = {
      producto_id: selectedProduct.id,
      producto_nombre: selectedProduct.nombre,
      cantidad_ordenada: qty,
      costo_unitario: cost
    };

    setPoItems([...poItems, newItem]);
    setAddItemModalVisible(false);
  };

  const handleRemovePoItem = (index) => {
    const updated = [...poItems];
    updated.splice(index, 1);
    setPoItems(updated);
  };

  const handleSavePurchaseOrder = async () => {
    if (!poProveedor.trim()) {
      Alert.alert('Falta Proveedor', 'Ingrese el nombre del proveedor.');
      return;
    }
    if (poItems.length === 0) {
      Alert.alert('Falta Detalle', 'Debe agregar al menos un producto a la orden.');
      return;
    }

    setSubmittingPo(true);
    try {
      const response = await fetch(`${API_URL}/purchase-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          proveedor_nombre: poProveedor.trim(),
          items: poItems
        })
      });

      const resData = await response.json();
      setSubmittingPo(false);

      if (response.ok) {
        Alert.alert('Éxito', 'Orden de compra registrada con éxito.');
        setPoModalVisible(false);
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo guardar la orden.');
      }
    } catch (error) {
      setSubmittingPo(false);
      console.log('Error al guardar PO:', error);
      Alert.alert('Error de red', 'No se pudo registrar la orden.');
    }
  };

  // Recepción de PO
  const handleOpenReceive = async (po) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/purchase-orders/${po.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoading(false);
      if (response.ok) {
        setReceivingPo(resData.header);
        setReceivingItems(resData.items);
        setReceivingFactura('');
        
        // Inicializar recibidos pre-llenados con la cantidad ordenada
        const initialQty = {};
        resData.items.forEach(item => {
          initialQty[item.producto_id] = item.cantidad_ordenada.toString();
        });
        setReceivedQuantities(initialQty);
        setReceiveModalVisible(true);
      } else {
        Alert.alert('Error', 'No se pudo obtener detalles de la orden.');
      }
    } catch (error) {
      setLoading(false);
      console.log('Error al abrir recepcion:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };

  const handleConfirmReceive = async () => {
    if (!receivingFactura.trim()) {
      Alert.alert('Falta Factura', 'Debe ingresar el número de factura del proveedor.');
      return;
    }

    const itemsToSubmit = [];
    let valid = true;

    receivingItems.forEach(item => {
      const qtyStr = receivedQuantities[item.producto_id];
      const qty = parseInt(qtyStr);
      if (isNaN(qty) || qty < 0) {
        valid = false;
      }
      itemsToSubmit.push({
        producto_id: item.producto_id,
        cantidad_recibida: qty
      });
    });

    if (!valid) {
      Alert.alert('Valores Inválidos', 'Las cantidades recibidas deben ser números enteros de 0 o más.');
      return;
    }

    setSubmittingReceive(true);
    try {
      const response = await fetch(`${API_URL}/purchase-orders/${receivingPo.id}/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          factura_proveedor: receivingFactura.trim(),
          items_recibidos: itemsToSubmit
        })
      });

      const resData = await response.json();
      setSubmittingReceive(false);

      if (response.ok) {
        if (resData.notaDebitoCreada) {
          Alert.alert(
            'Recepción con Discrepancia',
            `Entrada registrada.\n\n⚠️ SE GENERÓ NOTA DE DÉBITO:\nFaltantes detectados contra factura.\nMonto penalizado: $${Number(resData.montoDiferencia).toFixed(2)} (IVA inc.).`
          );
        } else {
          Alert.alert('Éxito', 'Entrada de mercancía registrada perfectamente. Inventario incrementado.');
        }
        setReceiveModalVisible(false);
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo registrar el ingreso.');
      }
    } catch (error) {
      setSubmittingReceive(false);
      console.log('Error al recibir PO:', error);
      Alert.alert('Error de red', 'No se pudo registrar la recepción.');
    }
  };

  // RENDERS DE SIMULACIÓN
  if (simulatedRole === 'consultor') {
    return (
      <ConsultorDashboard
        token={token}
        user={{ id: 999, nombre: 'Simulación Consultor', rol: 'consultor' }}
        onLogout={() => setSimulatedRole(null)}
      />
    );
  }

  if (simulatedRole === 'vendedor') {
    return (
      <VendedorDashboard
        token={token}
        user={{ id: 998, nombre: 'Simulación Vendedor', rol: 'vendedor' }}
        onLogout={() => setSimulatedRole(null)}
      />
    );
  }

  if (loading && !userModalVisible && !poModalVisible && !receiveModalVisible) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Cargando panel de licorería...</Text>
      </View>
    );
  }

  const stats = data?.estadisticas || { ventas: 0, productos: 0, poPendientes: 0, notasDebito: 0, valorInventario: 0 };
  const bitacora = data?.bitacora || [];
  const usuarios = data?.usuarios || [];
  const salesHistory = data?.historicoVentas || [];
  const maxSaleVal = Math.max(...salesHistory.map(d => d.total), 1);

  // Cálculos de PO Builder
  const poSubtotal = poItems.reduce((acc, item) => acc + (item.cantidad_ordenada * item.costo_unitario), 0);
  const poIva = poSubtotal * 0.16;
  const poTotal = poSubtotal + poIva;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Gestión Licorería</Text>
          <Text style={styles.headerSubtitle}>Bienvenido, {user.nombre} (Admin)</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color="#f87171" />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      <ScrollView style={styles.content}>
        
        {/* TAB 1: METRICAS */}
        {activeTab === 'dashboard' && (
          <View>
            <Text style={styles.sectionTitle}>Métricas Generales</Text>
            
            {/* Valor de Inventario Completo */}
            <View style={styles.valueCard}>
              <Ionicons name="shield-checkmark" size={26} color="#10b981" />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.valueLabel}>Valor del Inventario Almacén</Text>
                <Text style={styles.valueNumber}>${Number(stats.valorInventario).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Ionicons name="cart-outline" size={24} color="#3b82f6" />
                <Text style={styles.statNumber}>{stats.ventas}</Text>
                <Text style={styles.statLabel}>Ventas Registradas</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="cube-outline" size={24} color="#a855f7" />
                <Text style={styles.statNumber}>{stats.productos}</Text>
                <Text style={styles.statLabel}>Licores en Catálogo</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="document-text-outline" size={24} color="#f59e0b" />
                <Text style={styles.statNumber}>{stats.poPendientes}</Text>
                <Text style={styles.statLabel}>O.C. Pendientes</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="alert-circle-outline" size={24} color="#ef4444" />
                <Text style={styles.statNumber}>{stats.notasDebito}</Text>
                <Text style={styles.statLabel}>Notas de Débito</Text>
              </View>
            </View>

            {/* Gráficos de Análisis */}
            <Text style={styles.sectionTitle}>Análisis Comercial</Text>
            
            {/* Chart 2: Histórico de Ventas */}
            <View style={styles.chartPanel}>
              <Text style={styles.chartTitle}>Histórico de Ventas Semanal (Monto Diario)</Text>
              
              <View style={styles.verticalChartContainer}>
                {salesHistory.map((item, index) => {
                  const heightPct = item.total > 0 ? Math.max((item.total / maxSaleVal) * 100, 6) : 0;
                  
                  return (
                    <View key={item.fecha || index} style={styles.verticalChartColumn}>
                      <Text style={styles.verticalChartValText}>
                        {item.total > 0 ? `$${Math.round(item.total)}` : ''}
                      </Text>
                      
                      <View style={styles.verticalChartBarTrack}>
                        <View
                          style={[
                            styles.verticalChartBarFill,
                            {
                              height: `${heightPct}%`,
                              backgroundColor: item.total > 0 ? '#10b981' : '#334155'
                            }
                          ]}
                        />
                      </View>
                      
                      <Text style={styles.verticalChartLabelText}>{item.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color="#3b82f6" style={{ marginRight: 8 }} />
              <Text style={styles.infoCardText}>
                La base de datos está operando en la Licorería. El conteo físico del Consultor ajusta directamente las existencias del catálogo.
              </Text>
            </View>
          </View>
        )}

        {/* TAB 2: COMPRAS (ÓRDENES Y NOTAS DE DÉBITO) */}
        {activeTab === 'compras' && (
          <View>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Órdenes de Compra</Text>
              <TouchableOpacity style={styles.createButton} onPress={handleOpenPoModal}>
                <Ionicons name="add-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.createButtonText}>Nueva Orden</Text>
              </TouchableOpacity>
            </View>

            {purchaseOrders.length === 0 ? (
              <Text style={styles.emptyText}>No hay órdenes de compra registradas.</Text>
            ) : (
              purchaseOrders.map((item) => (
                <View key={item.id} style={styles.poCard}>
                  <View style={styles.poHeader}>
                    <View>
                      <Text style={styles.poIdText}>O.C. #{item.id}</Text>
                      <Text style={styles.poProviderText}>Proveedor: {item.proveedor_nombre}</Text>
                    </View>
                    <View style={[styles.statusBadge, styles[`statusBadge_${item.estado}`]]}>
                      <Text style={[styles.statusBadgeText, styles[`statusBadgeText_${item.estado}`]]}>
                        {item.estado.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.poDetailsRow}>
                    <View>
                      <Text style={styles.poDateText}>
                        Fecha: {new Date(item.fecha_creacion).toLocaleDateString('es-ES')}
                      </Text>
                      <Text style={styles.poCostText}>
                        Costo: ${Number(item.total_costo).toFixed(2)} + IVA (${Number(item.iva).toFixed(2)})
                      </Text>
                    </View>
                    <Text style={styles.poTotalValText}>
                      ${Number(item.total_con_iva).toFixed(2)}
                    </Text>
                  </View>
                  
                  {item.estado === 'pendiente' && (
                    <TouchableOpacity style={styles.receiveButton} onPress={() => handleOpenReceive(item)}>
                      <Ionicons name="enter-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.receiveButtonText}>Registrar Entrada / Dar Entrada</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Notas de Débito a Proveedores</Text>
            {debitNotes.length === 0 ? (
              <Text style={styles.emptyText}>No se han generado notas de débito.</Text>
            ) : (
              debitNotes.map((item) => (
                <View key={item.id} style={styles.ndCard}>
                  <View style={styles.ndHeader}>
                    <Text style={styles.ndTitle}>Nota de Débito #{item.id}</Text>
                    <Text style={styles.ndMonto}>-${Number(item.monto_diferencia).toFixed(2)}</Text>
                  </View>
                  <Text style={styles.ndProvider}>Proveedor: {item.proveedor_nombre} (O.C. #{item.orden_compra_id})</Text>
                  <Text style={styles.ndFactura}>Factura Proveedor: {item.factura_proveedor}</Text>
                  <Text style={styles.ndDesc}>{item.descripcion}</Text>
                  <Text style={styles.ndDate}>
                    Generado el: {new Date(item.fecha_creacion).toLocaleString('es-ES')}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: USUARIOS CRUD */}
        {activeTab === 'usuarios' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Gestión de Usuarios</Text>
              <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
                <Ionicons name="person-add-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.createButtonText}>Crear</Text>
              </TouchableOpacity>
            </View>

            {usuarios.length === 0 ? (
              <Text style={styles.emptyText}>No hay usuarios.</Text>
            ) : (
              usuarios.map((item) => (
                <View key={item.id} style={styles.userItem}>
                  <View style={styles.userMeta}>
                    <Text style={styles.userName}>{item.nombre}</Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={[styles.roleBadge, styles[`roleBadge_${item.rol}`]]}>
                        <Text style={[styles.roleBadgeText, styles[`roleBadgeText_${item.rol}`]]}>
                          {item.rol.toUpperCase()}
                        </Text>
                      </View>
                      
                      {item.rol === 'consultor' && (
                        <TouchableOpacity
                          style={[
                            styles.toggleAuthButton,
                            item.conteo_autorizado ? styles.authButtonActive : styles.authButtonInactive
                          ]}
                          onPress={() => handleToggleConteoAuth(item)}
                        >
                          <Ionicons
                            name={item.conteo_autorizado ? 'shield-checkmark-outline' : 'shield-outline'}
                            size={12}
                            color={item.conteo_autorizado ? '#34d399' : '#f87171'}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={item.conteo_autorizado ? styles.toggleAuthButtonTextActive : styles.toggleAuthButtonTextInactive}>
                            {item.conteo_autorizado ? 'Autorizado' : 'Sin Acceso'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.userActions}>
                    <TouchableOpacity style={styles.actionButtonEdit} onPress={() => openEditModal(item)}>
                      <Ionicons name="create-outline" size={16} color="#3b82f6" />
                    </TouchableOpacity>
                    {item.id !== user.id && (
                      <TouchableOpacity style={styles.actionButtonDelete} onPress={() => handleDeleteUser(item)}>
                        <Ionicons name="trash-outline" size={16} color="#f87171" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 4: BITACORA */}
        {activeTab === 'bitacora' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Bitácora de Eventos</Text>
              <TouchableOpacity onPress={fetchDashboardData}>
                <Ionicons name="refresh-outline" size={20} color="#3b82f6" />
              </TouchableOpacity>
            </View>

            {bitacora.length === 0 ? (
              <Text style={styles.emptyText}>No hay registros.</Text>
            ) : (
              bitacora.map((item) => (
                <View key={item.id} style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logAction}>{item.accion}</Text>
                    <Text style={styles.logDate}>
                      {new Date(item.fecha).toLocaleString('es-ES', { timeZone: 'UTC', hour12: false })}
                    </Text>
                  </View>
                  <Text style={styles.logDescription}>{item.descripcion}</Text>
                  <Text style={styles.logUser}>
                    Por: <Text style={{ fontWeight: '600' }}>{item.usuario || 'Sistema'}</Text>
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 5: SIMULADOR DE VISTAS */}
        {activeTab === 'simulador' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitleForm}>Simulador de Interfaces</Text>
            <Text style={styles.simulatorText}>
              Seleccione qué vista de rol desea simular y renderizar. Podrá ver e interactuar con los dashboards de forma idéntica a los usuarios reales.
            </Text>

            <TouchableOpacity
              style={[styles.simCardButton, { borderLeftColor: '#10b981' }]}
              onPress={() => setSimulatedRole('consultor')}
            >
              <View style={styles.simCardIconContainer}>
                <Ionicons name="calendar" size={32} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.simCardTitle}>Vista del Consultor</Text>
                <Text style={styles.simCardDesc}>Permite realizar conteos de inventario por categoría, imprimir reportes y aplicarlos con credenciales.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simCardButton, { borderLeftColor: '#2563eb' }]}
              onPress={() => setSimulatedRole('vendedor')}
            >
              <View style={styles.simCardIconContainer}>
                <Ionicons name="cart" size={32} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.simCardTitle}>Vista del Vendedor</Text>
                <Text style={styles.simCardDesc}>Permite buscar productos, filtrar por categoría y facturar con Cliente General por defecto.</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* BOTTOM TAB BAR (Menú Inferior) */}
      <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'dashboard' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('dashboard')}
        >
          <Ionicons
            name={activeTab === 'dashboard' ? 'analytics' : 'analytics-outline'}
            size={20}
            color={activeTab === 'dashboard' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'dashboard' && styles.tabBarTextActive]}>Métricas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'compras' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('compras')}
        >
          <Ionicons
            name={activeTab === 'compras' ? 'receipt' : 'receipt-outline'}
            size={20}
            color={activeTab === 'compras' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'compras' && styles.tabBarTextActive]}>Compras</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'usuarios' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('usuarios')}
        >
          <Ionicons
            name={activeTab === 'usuarios' ? 'people' : 'people-outline'}
            size={20}
            color={activeTab === 'usuarios' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'usuarios' && styles.tabBarTextActive]}>Usuarios</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'bitacora' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('bitacora')}
        >
          <Ionicons
            name={activeTab === 'bitacora' ? 'document-text' : 'document-text-outline'}
            size={20}
            color={activeTab === 'bitacora' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'bitacora' && styles.tabBarTextActive]}>Bitácora</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'simulador' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('simulador')}
        >
          <Ionicons
            name={activeTab === 'simulador' ? 'eye' : 'eye-outline'}
            size={20}
            color={activeTab === 'simulador' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'simulador' && styles.tabBarTextActive]}>Simulador</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL CREAR / EDITAR USUARIO */}
      <Modal
        visible={userModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setUserModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingUser ? 'Modificar Usuario' : 'Crear Nuevo Usuario'}
              </Text>
              <TouchableOpacity onPress={() => setUserModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre Completo</Text>
                <TextInput
                  style={styles.formInput}
                  value={formNombre}
                  onChangeText={setFormNombre}
                  placeholder="Ej. Juan Pérez"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Correo Electrónico</Text>
                <TextInput
                  style={styles.formInput}
                  value={formEmail}
                  onChangeText={setFormEmail}
                  placeholder="ejemplo@sistema.com"
                  placeholderTextColor="#64748b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Contraseña {editingUser ? '(dejar vacío para no cambiar)' : ''}
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={formPassword}
                  onChangeText={setFormPassword}
                  placeholder={editingUser ? 'Nueva contraseña' : 'Clave de acceso'}
                  placeholderTextColor="#64748b"
                  secureTextEntry={true}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Rol del Usuario</Text>
                {editingUser && editingUser.id === user.id ? (
                  <View style={[styles.roleSelectionRow, { backgroundColor: '#0f172a', justifyContent: 'center', paddingVertical: 12 }]}>
                    <Ionicons name="lock-closed-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '600' }}>
                      ADMINISTRADOR (Rol propio bloqueado)
                    </Text>
                  </View>
                ) : (
                  <View style={styles.roleSelectionRow}>
                    <TouchableOpacity
                      style={[styles.roleSelectButton, formRol === 'vendedor' && styles.roleSelectButtonActive]}
                      onPress={() => setFormRol('vendedor')}
                    >
                      <Text style={[styles.roleSelectText, formRol === 'vendedor' && styles.roleSelectTextActive]}>
                        Vendedor
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.roleSelectButton, formRol === 'consultor' && styles.roleSelectButtonActive]}
                      onPress={() => setFormRol('consultor')}
                    >
                      <Text style={[styles.roleSelectText, formRol === 'consultor' && styles.roleSelectTextActive]}>
                        Consultor
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.roleSelectButton, formRol === 'admin' && styles.roleSelectButtonActive]}
                      onPress={() => setFormRol('admin')}
                    >
                      <Text style={[styles.roleSelectText, formRol === 'admin' && styles.roleSelectTextActive]}>
                        Admin
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveUser}
                disabled={submittingUser}
              >
                {submittingUser ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Guardar Cambios</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL CREAR ORDEN DE COMPRA */}
      <Modal
        visible={poModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva Orden de Compra</Text>
              <TouchableOpacity onPress={() => setPoModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre del Proveedor</Text>
                <TextInput
                  style={styles.formInput}
                  value={poProveedor}
                  onChangeText={setPoProveedor}
                  placeholder="Ej. Distribuidora de Licores S.A."
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={styles.panelHeader}>
                <Text style={styles.formLabel}>Productos Solicitados</Text>
                <TouchableOpacity style={styles.addButtonMini} onPress={handleOpenAddItem}>
                  <Text style={styles.addButtonMiniText}>+ Agregar Licor</Text>
                </TouchableOpacity>
              </View>

              {poItems.length === 0 ? (
                <Text style={styles.emptyTextItems}>Ninguno agregado aún.</Text>
              ) : (
                poItems.map((item, idx) => (
                  <View key={idx} style={styles.poItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.poItemName}>{item.producto_nombre}</Text>
                      <Text style={styles.poItemSub}>
                        {item.cantidad_ordenada} unidades x ${item.costo_unitario.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={styles.poItemTotal}>
                      ${(item.cantidad_ordenada * item.costo_unitario).toFixed(2)}
                    </Text>
                    <TouchableOpacity style={styles.removeIcon} onPress={() => handleRemovePoItem(idx)}>
                      <Ionicons name="trash-outline" size={16} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Totales y Cálculo de IVA 16% */}
              <View style={styles.poTotalSummary}>
                <View style={styles.poTotalLine}>
                  <Text style={styles.poTotalLineLabel}>Subtotal Costo:</Text>
                  <Text style={styles.poTotalLineVal}>${poSubtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.poTotalLine}>
                  <Text style={styles.poTotalLineLabel}>IVA (16%):</Text>
                  <Text style={styles.poTotalLineVal}>${poIva.toFixed(2)}</Text>
                </View>
                <View style={[styles.poTotalLine, { borderTopWidth: 1, borderColor: '#334155', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={styles.poTotalLabel}>Total con IVA:</Text>
                  <Text style={styles.poTotalValue}>${poTotal.toFixed(2)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSavePurchaseOrder}
                disabled={submittingPo}
              >
                {submittingPo ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Registrar Orden de Compra</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL DETALLE AGREGAR ITEM A PO */}
      <Modal
        visible={addItemModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAddItemModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Licor a Orden</Text>
              <TouchableOpacity onPress={() => setAddItemModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Seleccione Producto</Text>
                <View style={styles.pickerSelector}>
                  <FlatList
                    data={poCatalog}
                    keyExtractor={(item) => item.id.toString()}
                    style={{ maxHeight: 150 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.pickerItem, selectedProduct?.id === item.id && styles.pickerItemActive]}
                        onPress={() => {
                          setSelectedProduct(item);
                          setPoItemCost(item.precio.toString());
                        }}
                      >
                        <Text style={styles.pickerItemText}>{item.nombre}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cantidad a Ordenar</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={poItemQty}
                  onChangeText={setPoItemQty}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Costo Unitario (Sin IVA)</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={poItemCost}
                  onChangeText={setPoItemCost}
                />
              </View>

              <TouchableOpacity style={styles.addButtonFull} onPress={handleAddPoItem}>
                <Text style={styles.addButtonFullText}>Confirmar Agregar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL RECEPCIÓN DE MERCADERÍA (DAR ENTRADA) */}
      <Modal
        visible={receiveModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReceiveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recibir Órden / Entrada</Text>
              <TouchableOpacity onPress={() => setReceiveModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {receivingPo && (
                <View style={styles.poSummaryReceive}>
                  <Text style={styles.poSummaryReceiveTitle}>O.C. #{receivingPo.id} | {receivingPo.proveedor_nombre}</Text>
                  <Text style={styles.poSummaryReceiveSub}>Total orden: ${Number(receivingPo.total_con_iva).toFixed(2)} (IVA inc.)</Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Factura del Proveedor</Text>
                <TextInput
                  style={styles.formInput}
                  value={receivingFactura}
                  onChangeText={setReceivingFactura}
                  placeholder="Ej. FACT-98765"
                  placeholderTextColor="#64748b"
                />
              </View>

              <Text style={[styles.formLabel, { marginBottom: 8 }]}>Verificar Unidades Físicas Recibidas:</Text>
              
              {receivingItems.map((item) => (
                <View key={item.producto_id} style={styles.receiveItemCard}>
                  <Text style={styles.receiveItemName}>{item.producto_nombre}</Text>
                  <Text style={styles.receiveItemSub}>
                    Cantidad ordenada: <Text style={{ fontWeight: 'bold' }}>{item.cantidad_ordenada}</Text> u.
                  </Text>
                  <View style={styles.receiveInputRow}>
                    <Text style={styles.receiveInputLabel}>Unidades Recibidas:</Text>
                    <TextInput
                      style={styles.receiveInputText}
                      keyboardType="numeric"
                      value={receivedQuantities[item.producto_id] || ''}
                      onChangeText={(val) => {
                        const updated = { ...receivedQuantities };
                        updated[item.producto_id] = val;
                        setReceivedQuantities(updated);
                      }}
                    />
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.submitButtonApply}
                onPress={handleConfirmReceive}
                disabled={submittingReceive}
              >
                {submittingReceive ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="enter-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Registrar Entrada de Mercadería</Text>
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
    paddingHorizontal: 10,
    borderRadius: 6
  },
  logoutText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4
  },
  content: {
    flex: 1,
    padding: 16
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16
  },
  valueLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  valueNumber: {
    color: '#10b981',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  statCard: {
    width: '48%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center'
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 6
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    textAlign: 'center'
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8
  },
  infoCardText: {
    color: '#93c5fd',
    fontSize: 12,
    lineHeight: 18,
    flex: 1
  },
  panel: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16
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
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20
  },
  emptyTextItems: {
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 10,
    fontStyle: 'italic'
  },
  logCard: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  logAction: {
    color: '#3b82f6',
    fontWeight: '700',
    fontSize: 11
  },
  logDate: {
    color: '#64748b',
    fontSize: 10
  },
  logDescription: {
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4
  },
  logUser: {
    color: '#94a3b8',
    fontSize: 10
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  userMeta: {
    flex: 1
  },
  userName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600'
  },
  userEmail: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 1,
    marginBottom: 4
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionButtonEdit: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    padding: 8,
    borderRadius: 4,
    marginRight: 8
  },
  actionButtonDelete: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    padding: 8,
    borderRadius: 4
  },
  roleBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start'
  },
  roleBadge_admin: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  roleBadgeText_admin: {
    color: '#f87171'
  },
  roleBadge_consultor: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  roleBadgeText_consultor: {
    color: '#34d399'
  },
  roleBadge_vendedor: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  roleBadgeText_vendedor: {
    color: '#60a5fa'
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: 'bold'
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
    borderColor: '#3b82f6'
  },
  tabBarText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500'
  },
  tabBarTextActive: {
    color: '#3b82f6',
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
  roleSelectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  roleSelectButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 4
  },
  roleSelectButtonActive: {
    backgroundColor: '#3b82f6'
  },
  roleSelectText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600'
  },
  roleSelectTextActive: {
    color: '#ffffff'
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
  },
  submitButtonApply: {
    flexDirection: 'row',
    backgroundColor: '#10b981',
    borderRadius: 6,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  simulatorText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20
  },
  simCardButton: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center'
  },
  simCardIconContainer: {
    marginRight: 16,
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 6
  },
  simCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2
  },
  simCardDesc: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 15
  },
  chartPanel: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 12
  },
  verticalChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 16,
    paddingBottom: 4,
    marginTop: 8
  },
  verticalChartColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%'
  },
  verticalChartBarTrack: {
    width: 22,
    height: 80,
    backgroundColor: '#0f172a',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end'
  },
  verticalChartBarFill: {
    width: '100%',
    borderRadius: 4
  },
  verticalChartValText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center'
  },
  verticalChartLabelText: {
    color: '#94a3b8',
    fontSize: 9,
    marginTop: 6,
    textAlign: 'center'
  },
  poCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12
  },
  poHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 8,
    marginBottom: 8
  },
  poIdText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f8fafc'
  },
  poProviderText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1
  },
  statusBadge_pendiente: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  statusBadgeText_pendiente: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: 'bold'
  },
  statusBadge_ingresado: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  statusBadgeText_ingresado: {
    color: '#34d399',
    fontSize: 9,
    fontWeight: 'bold'
  },
  statusBadge_discrepancia: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  statusBadgeText_discrepancia: {
    color: '#f87171',
    fontSize: 9,
    fontWeight: 'bold'
  },
  poDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  poDateText: {
    fontSize: 11,
    color: '#64748b'
  },
  poCostText: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 2
  },
  poTotalValText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc'
  },
  receiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingVertical: 8,
    marginTop: 4
  },
  receiveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  addButtonMini: {
    backgroundColor: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#475569'
  },
  addButtonMiniText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600'
  },
  poItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  poItemName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600'
  },
  poItemSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  poItemTotal: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 10
  },
  removeIcon: {
    padding: 4
  },
  poTotalSummary: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 12,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  poTotalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  poTotalLineLabel: {
    color: '#94a3b8',
    fontSize: 12
  },
  poTotalLineVal: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  poTotalLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  poTotalValue: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '800'
  },
  pickerSelector: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 8
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  pickerItemActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)'
  },
  pickerItemText: {
    color: '#e2e8f0',
    fontSize: 13
  },
  addButtonFull: {
    backgroundColor: '#2563eb',
    height: 44,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10
  },
  addButtonFullText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  poSummaryReceive: {
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  poSummaryReceiveTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  poSummaryReceiveSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  receiveItemCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10
  },
  receiveItemName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  receiveItemSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  receiveInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b'
  },
  receiveInputLabel: {
    color: '#cbd5e1',
    fontSize: 12
  },
  receiveInputText: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 4,
    width: 80,
    height: 36,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 14
  },
  ndCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12
  },
  ndHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  ndTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc'
  },
  ndMonto: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ef4444'
  },
  ndProvider: {
    fontSize: 12,
    color: '#cbd5e1',
    marginBottom: 2
  },
  ndFactura: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4
  },
  ndDesc: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 15,
    backgroundColor: '#0f172a',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
    marginBottom: 6
  },
  ndDate: {
    fontSize: 10,
    color: '#64748b'
  },
  toggleAuthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginLeft: 8,
    borderWidth: 1
  },
  authButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  authButtonInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  toggleAuthButtonTextActive: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700'
  },
  toggleAuthButtonTextInactive: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '700'
  }
});

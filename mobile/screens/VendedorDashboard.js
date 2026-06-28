import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import { API_URL } from '../config';

export default function VendedorDashboard({ token, user, onLogout }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('productos'); // 'productos', 'ventas', 'nueva_venta', 'consultar', 'caja'

  // Estados de búsqueda y filtros
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [consultaSearch, setConsultaSearch] = useState('');
  const [consultaCategory, setConsultaCategory] = useState('all');

  // Carrito de compras (Múltiples Artículos)
  const [cart, setCart] = useState([]);

  // Formulario de venta
  const [selectedClient, setSelectedClient] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Modales de selección
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);
  
  // Registrar cliente
  const [newClientModalVisible, setNewClientModalVisible] = useState(false);
  const [newClientNombre, setNewClientNombre] = useState('');
  const [newClientTelefono, setNewClientTelefono] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientDireccion, setNewClientDireccion] = useState('');
  const [submittingClient, setSubmittingClient] = useState(false);

  // === ESTADOS NUEVOS: CAJA ===
  const [estadoCaja, setEstadoCaja] = useState(null); // { aperturaActiva, cierreDia }
  const [loadingCaja, setLoadingCaja] = useState(false);
  const [ventasHoy, setVentasHoy] = useState([]);
  const [totalHoy, setTotalHoy] = useState(0);
  const [loadingVentasHoy, setLoadingVentasHoy] = useState(false);
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('');

  const [aperturaModalVisible, setAperturaModalVisible] = useState(false);
  const [montoApertura, setMontoApertura] = useState('1000');
  const [submittingApertura, setSubmittingApertura] = useState(false);

  // Estados para autorización de cierre de caja (admin)
  const [adminAuthModalVisible, setAdminAuthModalVisible] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [submittingAdminAuth, setSubmittingAdminAuth] = useState(false);

  // === ESTADOS: HISTORIAL DE CAJAS ===
  const [historialCajas, setHistorialCajas] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [sesionModalVisible, setSesionModalVisible] = useState(false);
  const [selectedSesion, setSelectedSesion] = useState(null); // { caja, ventas }
  const [loadingSesion, setLoadingSesion] = useState(false);

  const fetchVendedorData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/dashboard/vendedor`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (response.ok) {
        setData(resData);
        // Pre-seleccionar "Cliente General"
        if (resData.clientes && resData.clientes.length > 0 && !selectedClient) {
          const generalClient = resData.clientes.find(c => c.nombre.toLowerCase().includes('general'));
          setSelectedClient(generalClient || resData.clientes[0]);
        }
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo obtener datos del servidor.');
      }
    } catch (error) {
      console.log('Error al obtener datos vendedor:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendedorData();
  }, []);

  const addToCart = (product) => {
    if (product.stock <= 0) {
      Alert.alert('Sin Existencias', 'No hay stock disponible de este producto.');
      return;
    }
    const updatedCart = [...cart];
    const index = updatedCart.findIndex(item => item.producto_id === product.id);
    if (index >= 0) {
      if (updatedCart[index].cantidad >= product.stock) {
        Alert.alert('Límite de Stock', `No puede agregar más de las ${product.stock} unidades disponibles.`);
        return;
      }
      updatedCart[index].cantidad += 1;
      Alert.alert('Agregado', `Se incrementó a ${updatedCart[index].cantidad} unidades de "${product.nombre}" en la factura.`);
    } else {
      updatedCart.push({
        producto_id: product.id,
        nombre: product.nombre,
        precio: Number(product.precio),
        cantidad: 1,
        stock: product.stock
      });
      Alert.alert('Agregado', `"${product.nombre}" agregado a la factura.`);
    }
    setCart(updatedCart);
  };

  const updateCartQty = (prodId, newQty) => {
    const item = cart.find(i => i.producto_id === prodId);
    if (!item) return;

    if (newQty <= 0) {
      setCart(cart.filter(i => i.producto_id !== prodId));
      return;
    }

    if (newQty > item.stock) {
      Alert.alert('Límite de Stock', `No puede facturar más unidades. El stock disponible es ${item.stock}.`);
      return;
    }

    setCart(cart.map(i => i.producto_id === prodId ? { ...i, cantidad: newQty } : i));
  };

  // === FUNCIÓN: IMPRIMIR TICKET TÉRMICO ===
  const handlePrintTicket = async (ventaId, ventaData, itemsData) => {
    try {
      let venta = ventaData;
      let items = itemsData;
      if (!venta || !items) {
        const resp = await fetch(`${API_URL}/ventas/${ventaId}/detalle`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await resp.json();
        venta = d.venta;
        items = d.items;
      }
      const total = Number(venta.total);
      const subtotal = total / 1.15;
      const iva = total - subtotal;
      const fecha = new Date(venta.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Managua' });
      const itemsHtml = items.map(it =>
        `<tr><td style="padding:2px 4px;font-size:11px">${it.producto_nombre}</td><td style="text-align:center;font-size:11px">${it.cantidad}</td><td style="text-align:right;font-size:11px">C$${Number(it.precio_unitario).toFixed(2)}</td><td style="text-align:right;font-size:11px">C$${Number(it.subtotal).toFixed(2)}</td></tr>`
      ).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        @page{size:80mm auto;margin:4mm}
        body{font-family:monospace;font-size:12px;color:#000;margin:0;padding:0}
        h2{text-align:center;font-size:14px;margin:0 0 2px}
        p{text-align:center;font-size:10px;margin:2px 0}
        hr{border:none;border-top:1px dashed #000;margin:6px 0}
        table{width:100%;border-collapse:collapse}
        th{font-size:10px;border-bottom:1px solid #000;padding:2px 4px;text-align:left}
        .total-row{font-weight:bold;font-size:12px}
        .grand-total{font-weight:bold;font-size:14px;text-align:right}
      </style></head><body>
      <h2>LICORERÍA</h2>
      <p>Factura #${venta.id}</p>
      <p>Fecha: ${fecha}</p>
      <p>Cliente: ${venta.cliente_nombre || 'General'}</p>
      <p>Vendedor: ${venta.vendedor_nombre || ''}</p>
      <hr/>
      <table><thead><tr><th>Producto</th><th>Cant</th><th>P.U.</th><th>Total</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <hr/>
      <table>
        <tr><td style="font-size:11px">Subtotal:</td><td style="text-align:right;font-size:11px">C$${subtotal.toFixed(2)}</td></tr>
        <tr><td style="font-size:11px">IVA (15%):</td><td style="text-align:right;font-size:11px">C$${iva.toFixed(2)}</td></tr>
        <tr class="total-row"><td>TOTAL:</td><td class="grand-total">C$${total.toFixed(2)}</td></tr>
      </table>
      <hr/>
      <p style="margin-top:8px">Gracias por su compra.</p>
      </body></html>`;
      await Print.printAsync({ html });
    } catch (err) {
      console.log('Error al imprimir ticket:', err);
      Alert.alert('Error', 'No se pudo imprimir el ticket.');
    }
  };

  // === FUNCIÓN: APERTURA DE CAJA ===
  const fetchEstadoCaja = async () => {
    setLoadingCaja(true);
    try {
      const resp = await fetch(`${API_URL}/caja/estado-hoy`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setEstadoCaja(d);
      }
    } catch (e) { console.log('Error estado caja:', e); }
    finally { setLoadingCaja(false); }
  };

  const fetchVentasHoy = async () => {
    setLoadingVentasHoy(true);
    try {
      const resp = await fetch(`${API_URL}/caja/ventas-hoy`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setVentasHoy(d.ventas || []);
        setTotalHoy(d.totalDia || 0);
      }
    } catch (e) { console.log('Error ventas hoy:', e); }
    finally { setLoadingVentasHoy(false); }
  };

  const handleAperturaCaja = () => {
    setMontoApertura('1000');
    setAperturaModalVisible(true);
  };

  const submitAperturaCaja = async () => {
    const val = parseFloat(montoApertura);
    if (isNaN(val) || val < 0) {
      Alert.alert('Valor inválido', 'Por favor ingrese un monto de apertura válido.');
      return;
    }
    setSubmittingApertura(true);
    try {
      const resp = await fetch(`${API_URL}/caja/apertura`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ monto_apertura: val })
      });
      const d = await resp.json();
      Alert.alert(resp.ok ? 'Éxito' : 'Aviso', d.mensaje);
      if (resp.ok) {
        setAperturaModalVisible(false);
        fetchEstadoCaja();
        fetchVentasHoy();
        fetchVendedorData();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo conectar al servidor.');
    } finally {
      setSubmittingApertura(false);
    }
  };

  const handleAutorizarCierreCaja = async () => {
    if (!adminEmail.trim() || !adminPassword.trim()) {
      Alert.alert('Datos Incompletos', 'Debe ingresar el correo y la contraseña del administrador.');
      return;
    }
    setSubmittingAdminAuth(true);
    
    // Retraso intencional de 3 segundos para simular sincronización de documentos
    setTimeout(async () => {
      try {
        const resp = await fetch(`${API_URL}/caja/autorizar-cierre`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword.trim() })
        });
        const d = await resp.json();
        setSubmittingAdminAuth(false);
        Alert.alert(resp.ok ? 'Éxito' : 'Error', d.mensaje);
        if (resp.ok) {
          setAdminAuthModalVisible(false);
          setAdminEmail('');
          setAdminPassword('');
          fetchEstadoCaja();
          fetchVentasHoy();
          fetchVendedorData();
        }
      } catch (e) {
        setSubmittingAdminAuth(false);
        Alert.alert('Error de red', 'No se pudo conectar al servidor.');
      }
    }, 3000);
  };

  useEffect(() => {
    fetchEstadoCaja();
    if (activeTab === 'caja') {
      fetchVentasHoy();
    }
    if (activeTab === 'ventas') {
      fetchHistorialCajas();
    }
  }, [activeTab]);

  const fetchHistorialCajas = async () => {
    setLoadingHistorial(true);
    try {
      const resp = await fetch(`${API_URL}/caja/historial-cajas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setHistorialCajas(d);
      }
    } catch (e) { console.log('Error historial cajas:', e); }
    finally { setLoadingHistorial(false); }
  };

  const fetchVentasSesion = async (cajaId) => {
    setLoadingSesion(true);
    setSelectedSesion(null);
    setSesionModalVisible(true);
    try {
      const resp = await fetch(`${API_URL}/caja/sesion-ventas/${cajaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setSelectedSesion(d);
      }
    } catch (e) { console.log('Error sesion ventas:', e); }
    finally { setLoadingSesion(false); }
  };

  const handleCreateSale = async () => {
    if (!selectedClient) {
      Alert.alert('Falta Información', 'Debe seleccionar un cliente.');
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Falta Detalle', 'Debe agregar al menos un producto a la factura.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/ventas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cliente_id: selectedClient.id,
          items: cart.map(item => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad
          }))
        })
      });

      const resData = await response.json();
      setSubmitting(false);

      if (response.ok) {
        const ventaId = resData.ventaId;
        const cartSnapshot = [...cart];
        const clientSnap = selectedClient;
        setCart([]);
        fetchVendedorData();
        setActiveTab('ventas');
        // Imprimir ticket automáticamente para impresora térmica
        const ventaSimulada = {
          id: ventaId,
          total: cart.reduce((a, i) => a + i.cantidad * i.precio, 0),
          fecha: new Date().toISOString(),
          cliente_nombre: clientSnap?.nombre || 'General',
          vendedor_nombre: user?.nombre || ''
        };
        const itemsSimulados = cartSnapshot.map(i => ({
          producto_nombre: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          subtotal: i.cantidad * i.precio
        }));
        handlePrintTicket(ventaId, ventaSimulada, itemsSimulados);
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo facturar la venta.');
      }
    } catch (error) {
      setSubmitting(false);
      console.log('Error al registrar venta:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const handleSaveClient = async () => {
    if (!newClientNombre.trim() || !newClientTelefono.trim() || !newClientEmail.trim()) {
      Alert.alert('Falta Información', 'Nombre, teléfono y correo electrónico son obligatorios.');
      return;
    }

    setSubmittingClient(true);
    try {
      const response = await fetch(`${API_URL}/clientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: newClientNombre.trim(),
          telefono: newClientTelefono.trim(),
          email: newClientEmail.trim().toLowerCase(),
          direccion: newClientDireccion.trim()
        })
      });

      const resData = await response.json();
      setSubmittingClient(false);

      if (response.ok) {
        Alert.alert('Éxito', 'Cliente registrado de forma exitosa.');
        setNewClientModalVisible(false);
        setNewClientNombre('');
        setNewClientTelefono('');
        setNewClientEmail('');
        setNewClientDireccion('');
        
        setLoading(true);
        const refreshResponse = await fetch(`${API_URL}/dashboard/vendedor`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const refreshData = await refreshResponse.json();
        setLoading(false);
        
        if (refreshResponse.ok) {
          setData(refreshData);
          const created = refreshData.clientes.find(c => c.id === resData.clienteId);
          if (created) setSelectedClient(created);
        }
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo guardar el cliente.');
      }
    } catch (error) {
      setSubmittingClient(false);
      console.log('Error al registrar cliente:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loaderLogoOuter}>
          <View style={styles.loaderLogoInner}>
            <Ionicons name="cart" size={40} color="#2563eb" />
          </View>
        </View>
        <Text style={styles.loaderBrandText}>LICOSTOCK</Text>
        <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 20, marginBottom: 10 }} />
        <Text style={styles.loaderMessageText}>Sincronizando catálogo de ventas...</Text>
      </View>
    );
  }

  const ventas = data?.ventas || [];
  const productos = data?.productos || [];
  const clientes = data?.clientes || [];
  const categorias = data?.categorias || [];
  const resumen = data?.resumen || { totalVentasCount: 0, totalVendido: 0 };

  // Filtrado de productos en catálogo
  const filteredProducts = productos.filter(item => {
    const matchesSearch = item.nombre.toLowerCase().includes(searchText.toLowerCase()) || 
                          item.descripcion.toLowerCase().includes(searchText.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.categoria_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Totales de la Factura (Carrito)
  const cartTotal = cart.reduce((acc, item) => acc + (item.cantidad * item.precio), 0);
  const cartSubtotal = cartTotal / 1.15; // Desglosar IVA 15%
  const cartIva = cartTotal - cartSubtotal;
  const cartCount = cart.reduce((sum, item) => sum + item.cantidad, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Panel de Facturación</Text>
          <Text style={styles.headerSubtitle}>Bienvenido, {user.nombre}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color="#f87171" />
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Resumen de Ventas */}
        <View style={styles.resumenGrid}>
          <View style={styles.resumenCard}>
            <Text style={styles.resumenNumber}>{resumen.totalVentasCount}</Text>
            <Text style={styles.resumenLabel}>Ventas Hechas</Text>
          </View>
          <View style={styles.resumenCard}>
            <Text style={styles.resumenNumber}>C${Number(resumen.totalVendido).toFixed(2)}</Text>
            <Text style={styles.resumenLabel}>Total Facturado</Text>
          </View>
        </View>

        {/* Catalog Panel (Buscador y Filtro) */}
        {activeTab === 'productos' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Catálogo de Licores</Text>
              <TouchableOpacity onPress={fetchVendedorData}>
                <Ionicons name="refresh-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {/* Buscador */}
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Buscar licor o tabaco..."
                placeholderTextColor="#64748b"
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={18} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>

            {/* Categorías (Chips) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryChipsContainer}>
              <TouchableOpacity
                style={[styles.categoryChip, selectedCategory === 'all' && styles.categoryChipActive]}
                onPress={() => setSelectedCategory('all')}
              >
                <Text style={[styles.categoryChipText, selectedCategory === 'all' && styles.categoryChipTextActive]}>
                  Todos
                </Text>
              </TouchableOpacity>
              {categorias.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Text style={[styles.categoryChipText, selectedCategory === cat.id && styles.categoryChipTextActive]}>
                    {cat.nombre}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredProducts.length === 0 ? (
              <Text style={styles.emptyText}>No se encontraron productos.</Text>
            ) : (
              filteredProducts.map((item) => (
                <View key={item.id} style={styles.productCard}>
                  <View style={styles.productHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName}>{item.nombre}</Text>
                      <Text style={styles.productCategory}>{item.categoria_nombre || 'Sin categoría'}</Text>
                    </View>
                    <Text style={styles.productPrice}>C$${Number(item.precio).toFixed(2)}</Text>
                  </View>
                  <Text style={styles.productDesc}>{item.descripcion}</Text>
                  <View style={styles.stockRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.stockLabel}>Existencia:</Text>
                      <Text
                        style={[
                          styles.stockValue,
                          item.stock <= 5 ? styles.stockLow : styles.stockNormal
                        ]}
                      >
                        {item.stock} u.
                      </Text>
                    </View>
                    
                    <TouchableOpacity
                      style={[styles.quickBillButton, item.stock <= 0 && { backgroundColor: '#334155' }]}
                      onPress={() => addToCart(item)}
                      disabled={item.stock <= 0}
                    >
                      <Ionicons name="cart-outline" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                      <Text style={styles.quickBillButtonText}>Agregar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Sales List Panel */}
        {activeTab === 'ventas' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Historial de Cajas</Text>
              <TouchableOpacity onPress={fetchHistorialCajas}>
                <Ionicons name="refresh-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {loadingHistorial ? (
              <ActivityIndicator color="#2563eb" style={{ marginVertical: 24 }} />
            ) : historialCajas.length === 0 ? (
              <View style={{ alignItems: 'center', marginVertical: 24 }}>
                <Ionicons name="file-tray-outline" size={40} color="#334155" />
                <Text style={[styles.emptyText, { marginTop: 8 }]}>No hay cajas cerradas en el historial.</Text>
              </View>
            ) : (
              historialCajas.map((caja) => {
                const diferencia = Number(caja.diferencia);
                const diferenciaColor = diferencia < 0 ? '#f87171' : diferencia > 0 ? '#fbbf24' : '#10b981';
                return (
                  <TouchableOpacity
                    key={caja.id}
                    style={[styles.saleItem, { flexDirection: 'column', alignItems: 'stretch', paddingBottom: 8 }]}
                    onPress={() => fetchVentasSesion(caja.id)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.saleClient, { fontSize: 13 }]}>
                          {new Date(caja.fecha_caja + 'T00:00:00').toLocaleDateString('es-NI', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </Text>
                        {user?.rol === 'admin' && (
                          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Vendedor: {caja.vendedor_nombre}</Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.saleTotal, { fontSize: 14 }]}>C${Number(caja.total_ventas_sistema).toFixed(2)}</Text>
                        <View style={[styles.cajaCierreBadge, { backgroundColor: '#1e293b', borderWidth: 0, marginTop: 2 }]}>
                          <Text style={{ color: diferenciaColor, fontSize: 10, fontWeight: '700' }}>
                            {diferencia >= 0 ? '+' : ''}{diferencia.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <Text style={{ color: '#475569', fontSize: 11 }}>
                        Fondo: C${Number(caja.fondo_inicial).toFixed(2)} · Arqueo: C${Number(caja.efectivo_declarado).toFixed(2)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="list-outline" size={13} color="#3b82f6" />
                        <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '700' }}>Ver facturas</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}


        {/* Create Sale Form (Carrito Facturación) */}
        {activeTab === 'nueva_venta' && (() => {
          const aperturaActiva = estadoCaja?.aperturaActiva;
          const isBoxOpen = aperturaActiva !== null && aperturaActiva !== undefined;
          const isBoxOpenByMe = isBoxOpen && aperturaActiva.vendedor_id === user.id;
          const isBoxActive = isBoxOpen && (aperturaActiva.estado === 'abierta');
          const isBoxPorCerrar = isBoxOpen && (aperturaActiva.estado === 'listo_para_cierre' || aperturaActiva.estado === 'por_cerrar');

          return (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Facturar Venta (Múltiples Artículos)</Text>
                <TouchableOpacity
                  style={[styles.addButtonMiniBlue, (!isBoxActive || !isBoxOpenByMe) && { opacity: 0.5 }]}
                  onPress={() => {
                    if (!isBoxActive || !isBoxOpenByMe) {
                      Alert.alert("Facturación Bloqueada", "Debe tener una caja abierta de su propiedad para poder facturar.");
                      return;
                    }
                    setProductModalVisible(true);
                  }}
                  disabled={!isBoxActive || !isBoxOpenByMe}
                >
                  <Text style={styles.addButtonMiniBlueText}>+ Añadir más productos</Text>
                </TouchableOpacity>
              </View>

              {!isBoxActive || !isBoxOpenByMe ? (
                <View style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                  alignItems: 'center'
                }}>
                  <Ionicons name="alert-circle-outline" size={28} color="#f87171" style={{ marginBottom: 6 }} />
                  <Text style={{ color: '#f87171', fontWeight: '700', fontSize: 14, textAlign: 'center', marginBottom: 4 }}>
                    Facturación Bloqueada
                  </Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 12, textAlign: 'center' }}>
                    {!isBoxOpen 
                      ? "No hay una caja abierta en el sistema. Debe abrir la caja primero en la pestaña 'Caja'."
                      : isBoxPorCerrar
                      ? "La caja está en proceso de cierre (por cerrar). Espere el arqueo del Administrador."
                      : `La caja activa está abierta por el usuario "${aperturaActiva.vendedor_nombre}". Solo el propietario de la caja puede registrar ventas.`
                    }
                  </Text>
                </View>
              ) : null}

              {/* Listado del Carrito */}
              {cart.length === 0 ? (
                <View style={styles.emptyCartBox}>
                  <Ionicons name="cart-outline" size={40} color="#64748b" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyText}>El carrito está vacío.</Text>
                  <Text style={styles.emptySubText}>Agregue productos desde la pestaña 'Catálogo' o use el botón '+ Añadir más productos'.</Text>
                </View>
              ) : (
                cart.map((item) => (
                  <View key={item.producto_id} style={styles.cartItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName}>{item.nombre}</Text>
                      <Text style={styles.cartItemSub}>Precio Unitario: C$${item.precio.toFixed(2)}</Text>
                    </View>
                    
                    {/* Cantidades y Controles */}
                    <View style={styles.cartItemActions}>
                      <TouchableOpacity 
                        style={styles.qtyButton} 
                        onPress={() => updateCartQty(item.producto_id, item.cantidad - 1)}
                        disabled={!isBoxActive || !isBoxOpenByMe}
                      >
                        <Text style={styles.qtyButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.cantidad}</Text>
                      <TouchableOpacity 
                        style={styles.qtyButton} 
                        onPress={() => updateCartQty(item.producto_id, item.cantidad + 1)}
                        disabled={!isBoxActive || !isBoxOpenByMe}
                      >
                        <Text style={styles.qtyButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.cartItemTotal}>
                      C$${(item.cantidad * item.precio).toFixed(2)}
                    </Text>

                    <TouchableOpacity 
                      style={styles.removeCartItemIcon} 
                      onPress={() => updateCartQty(item.producto_id, 0)}
                      disabled={!isBoxActive || !isBoxOpenByMe}
                    >
                      <Ionicons name="trash-outline" size={16} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {cart.length > 0 && (
                <View>
                  {/* Desglose de IVA Cobrado y Total a Pagar */}
                  <View style={styles.cartTotalSummary}>
                    <View style={styles.cartTotalLine}>
                      <Text style={styles.cartTotalLineLabel}>Subtotal:</Text>
                      <Text style={styles.cartTotalLineVal}>C$${cartSubtotal.toFixed(2)}</Text>
                    </View>
                    <View style={styles.cartTotalLine}>
                      <Text style={styles.cartTotalLineLabel}>IVA Cobrado (15%):</Text>
                      <Text style={styles.cartTotalLineVal}>C$${cartIva.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.cartTotalLine, { borderTopWidth: 1, borderColor: '#334155', paddingTop: 8, marginTop: 4 }]}>
                      <Text style={styles.cartTotalLabel}>Total a Pagar:</Text>
                      <Text style={styles.cartTotalValue}>C$${cartTotal.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* Select Cliente */}
                  <View style={styles.formGroup}>
                    <View style={styles.clientFormHeader}>
                      <Text style={styles.formLabel}>Cliente (Opcional)</Text>
                      <TouchableOpacity
                        style={[styles.newClientButtonLink, (!isBoxActive || !isBoxOpenByMe) && { opacity: 0.5 }]}
                        onPress={() => {
                          if (!isBoxActive || !isBoxOpenByMe) return;
                          setNewClientModalVisible(true);
                        }}
                        disabled={!isBoxActive || !isBoxOpenByMe}
                      >
                        <Ionicons name="person-add-outline" size={14} color="#2563eb" style={{ marginRight: 4 }} />
                        <Text style={styles.newClientButtonLinkText}>+ Registrar Nuevo</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[styles.pickerSelector, (!isBoxActive || !isBoxOpenByMe) && { opacity: 0.5 }]}
                      onPress={() => {
                        if (!isBoxActive || !isBoxOpenByMe) return;
                        setClientModalVisible(true);
                      }}
                      disabled={!isBoxActive || !isBoxOpenByMe}
                    >
                      <Text style={selectedClient ? styles.pickerSelectedText : styles.pickerPlaceholderText}>
                        {selectedClient ? selectedClient.nombre : 'Cliente General'}
                      </Text>
                      <Ionicons name="chevron-down-outline" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, (!isBoxActive || !isBoxOpenByMe) && { opacity: 0.5 }]}
                    onPress={handleCreateSale}
                    disabled={submitting || !isBoxActive || !isBoxOpenByMe}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={styles.submitButtonText}>Confirmar Transacción / Facturar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}

        {/* === PESTAÑA: CONSULTAR PRECIO/STOCK === */}
        {activeTab === 'consultar' && (() => {
          const filtConsulta = (data?.productos || []).filter(p => {
            const ms = p.nombre.toLowerCase().includes(consultaSearch.toLowerCase()) ||
                       (p.descripcion || '').toLowerCase().includes(consultaSearch.toLowerCase());
            const mc = consultaCategory === 'all' || p.categoria_id === consultaCategory;
            return ms && mc;
          });
          return (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Consultar Precio y Existencias</Text>
              <View style={[styles.searchContainer, { marginTop: 12 }]}>
                <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={consultaSearch}
                  onChangeText={setConsultaSearch}
                  placeholder="Buscar producto..."
                  placeholderTextColor="#64748b"
                />
                {consultaSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setConsultaSearch('')}>
                    <Ionicons name="close-circle" size={18} color="#64748b" />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryChipsContainer}>
                <TouchableOpacity
                  style={[styles.categoryChip, consultaCategory === 'all' && styles.categoryChipActive]}
                  onPress={() => setConsultaCategory('all')}>
                  <Text style={[styles.categoryChipText, consultaCategory === 'all' && styles.categoryChipTextActive]}>Todos</Text>
                </TouchableOpacity>
                {(data?.categorias || []).map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryChip, consultaCategory === cat.id && styles.categoryChipActive]}
                    onPress={() => setConsultaCategory(cat.id)}>
                    <Text style={[styles.categoryChipText, consultaCategory === cat.id && styles.categoryChipTextActive]}>{cat.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {filtConsulta.length === 0 ? (
                <Text style={styles.emptyText}>No se encontraron productos.</Text>
              ) : (
                filtConsulta.map(p => (
                  <View key={p.id} style={[styles.saleItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                      <Text style={[styles.saleClient, { flex: 1 }]}>{p.nombre}</Text>
                      <Text style={[styles.saleTotal, { fontSize: 16 }]}>C${Number(p.precio).toFixed(2)}</Text>
                    </View>
                    <Text style={styles.productCategory}>{p.categoria_nombre || 'Sin categoría'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Ionicons name="cube-outline" size={13} color={p.stock <= 5 ? '#f87171' : '#10b981'} style={{ marginRight: 4 }} />
                      <Text style={[styles.stockLabel, { color: p.stock <= 5 ? '#f87171' : '#94a3b8' }]}>
                        Existencias: {p.stock} u.{p.stock <= 5 ? ' (Stock Bajo)' : ''}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          );
        })()}

        {/* === PESTAÑA: CAJA (Apertura / Ventas del Día) === */}
        {activeTab === 'caja' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Panel de Caja</Text>
              <TouchableOpacity onPress={() => { fetchEstadoCaja(); fetchVentasHoy(); }}>
                <Ionicons name="refresh-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {/* Estado de apertura */}
            {loadingCaja ? (
              <ActivityIndicator color="#2563eb" style={{ marginVertical: 20 }} />
            ) : estadoCaja?.aperturaActiva ? (() => {
              const apertura = estadoCaja.aperturaActiva;
              const isPorCerrar = apertura.estado === 'listo_para_cierre' || apertura.estado === 'por_cerrar';
              const isOwner = apertura.vendedor_id === user.id || user.rol === 'admin';

              return (
                <View>
                  <View style={styles.cajaStatusCard}>
                    <Ionicons 
                      name={isPorCerrar ? 'hourglass-outline' : 'checkmark-circle'} 
                      size={22} 
                      color={isPorCerrar ? '#fbbf24' : '#10b981'} 
                      style={{ marginRight: 8 }} 
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cajaStatusTitle}>
                        {isPorCerrar 
                          ? 'Por cerrar (Esperando Arqueo)' 
                          : `Caja Abierta (${apertura.vendedor_nombre || 'Sistema'})`}
                      </Text>
                      <Text style={styles.cajaStatusSub}>Fondo inicial: C$1,000.00</Text>
                    </View>
                  </View>
                  {apertura.estado === 'abierta' && isOwner && (
                    <TouchableOpacity 
                      style={[styles.submitButton, { marginTop: 12, backgroundColor: '#f59e0b' }]} 
                      onPress={() => setAdminAuthModalVisible(true)}
                    >
                      <Ionicons name="lock-open-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.submitButtonText}>Cerrar Caja (Requiere Admin)</Text>
                    </TouchableOpacity>
                  )}
                  {apertura.estado === 'abierta' && !isOwner && (
                    <View style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      borderColor: 'rgba(245, 158, 11, 0.25)',
                      borderWidth: 1,
                      borderRadius: 6,
                      padding: 12,
                      marginTop: 12
                    }}>
                      <Text style={{ color: '#fbbf24', fontSize: 12, textAlign: 'center' }}>
                        Esta caja está siendo operada por el usuario "{apertura.vendedor_nombre}". Solo dicho usuario o un administrador pueden solicitar el cierre.
                      </Text>
                    </View>
                  )}
                  {isPorCerrar && (
                    <Text style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic', marginTop: 8, textAlign: 'center' }}>
                      La caja ya está por cerrar. Esperando arqueo final en el panel del administrador.
                    </Text>
                  )}
                </View>
              );
            })() : estadoCaja?.cierreDia ? (
              <View>
                <View style={styles.cajaStatusCard}>
                  <Ionicons name="lock-closed" size={22} color="#94a3b8" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cajaStatusTitle, { color: '#cbd5e1' }]}>Caja Cerrada hoy</Text>
                    <Text style={styles.cajaStatusSub}>Ventas: C${Number(estadoCaja.cierreDia.total_ventas_sistema).toFixed(2)} | Arqueo: C${Number(estadoCaja.cierreDia.efectivo_declarado).toFixed(2)}</Text>
                  </View>
                  <View style={styles.cajaCierreBadge}>
                    <Text style={styles.cajaCierreBadgeText}>CERRADA</Text>
                  </View>
                </View>
                {user?.rol === 'admin' && (
                  <TouchableOpacity style={[styles.submitButton, { marginTop: 12, backgroundColor: '#10b981' }]} onPress={handleAperturaCaja}>
                    <Ionicons name="log-in-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Abrir Caja del Día</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View>
                <View style={styles.cajaStatusCard}>
                  <Ionicons name="lock-closed-outline" size={22} color="#f87171" style={{ marginRight: 8 }} />
                  <Text style={[styles.cajaStatusTitle, { color: '#f87171' }]}>Caja No Abierta</Text>
                </View>
                <TouchableOpacity style={[styles.submitButton, { marginTop: 12 }]} onPress={handleAperturaCaja}>
                  <Ionicons name="log-in-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitButtonText}>Abrir Caja del Día</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Ventas del día */}
            <View style={{ marginTop: 20 }}>
              <View style={styles.panelHeader}>
                <Text style={[styles.panelTitle, { fontSize: 13 }]}>Mis Ventas de Hoy</Text>
                <Text style={[styles.saleTotal, { fontSize: 14 }]}>C${Number(totalHoy).toFixed(2)}</Text>
              </View>
              {loadingVentasHoy ? (
                <ActivityIndicator color="#2563eb" />
              ) : ventasHoy.length === 0 ? (
                <Text style={styles.emptyText}>No hay ventas registradas hoy.</Text>
              ) : (
                ventasHoy.map(v => (
                  <View key={v.id} style={styles.saleItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saleClient}>Factura #{v.id} - {v.cliente_nombre}</Text>
                      <Text style={styles.saleDate}>{new Date(v.fecha).toLocaleString('es-ES', { timeStyle: 'short', timeZone: 'America/Managua' })}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.saleTotal}>C${Number(v.total).toFixed(2)}</Text>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
                        onPress={() => handlePrintTicket(v.id)}
                      >
                        <Ionicons name="print-outline" size={13} color="#2563eb" style={{ marginRight: 3 }} />
                        <Text style={{ color: '#2563eb', fontSize: 10, fontWeight: '700' }}>Reimprimir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        <View style={{ height: 70 }} />
      </ScrollView>

      {/* BOTTOM TAB BAR (Menú Inferior — 5 pestañas) */}
      <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'productos' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('productos')}
        >
          <Ionicons name={activeTab === 'productos' ? 'cube' : 'cube-outline'} size={20} color={activeTab === 'productos' ? '#2563eb' : '#94a3b8'} />
          <Text style={[styles.tabBarText, activeTab === 'productos' && styles.tabBarTextActive]}>Catálogo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'consultar' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('consultar')}
        >
          <Ionicons name={activeTab === 'consultar' ? 'search' : 'search-outline'} size={20} color={activeTab === 'consultar' ? '#2563eb' : '#94a3b8'} />
          <Text style={[styles.tabBarText, activeTab === 'consultar' && styles.tabBarTextActive]}>Consultar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'nueva_venta' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('nueva_venta')}
        >
          <Ionicons name={activeTab === 'nueva_venta' ? 'cart' : 'cart-outline'} size={22} color={activeTab === 'nueva_venta' ? '#2563eb' : '#94a3b8'} />
          <Text style={[styles.tabBarText, activeTab === 'nueva_venta' && styles.tabBarTextActive]}>
            Facturar{cartCount > 0 ? ` (${cartCount})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'ventas' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('ventas')}
        >
          <Ionicons name={activeTab === 'ventas' ? 'receipt' : 'receipt-outline'} size={20} color={activeTab === 'ventas' ? '#2563eb' : '#94a3b8'} />
          <Text style={[styles.tabBarText, activeTab === 'ventas' && styles.tabBarTextActive]}>Historial</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'caja' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('caja')}
        >
          <Ionicons name={activeTab === 'caja' ? 'cash' : 'cash-outline'} size={20} color={activeTab === 'caja' ? '#10b981' : '#94a3b8'} />
          <Text style={[styles.tabBarText, activeTab === 'caja' && styles.tabBarTextActive, activeTab === 'caja' && { color: '#10b981' }]}>Caja</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL DETALLE DE SESIÓN DE CAJA */}
      <Modal
        visible={sesionModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSesionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt" size={18} color="#2563eb" />
                <Text style={styles.modalTitle}>Detalle de Sesión</Text>
              </View>
              <TouchableOpacity onPress={() => setSesionModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            {loadingSesion ? (
              <ActivityIndicator color="#2563eb" style={{ marginVertical: 30 }} />
            ) : selectedSesion ? (() => {
              const { caja, ventas: ventasSesion } = selectedSesion;
              const diferencia = Number(caja.diferencia);
              const diferenciaColor = diferencia < 0 ? '#f87171' : diferencia > 0 ? '#fbbf24' : '#10b981';
              const totalSesion = ventasSesion.reduce((acc, v) => acc + Number(v.total), 0);
              return (
                <>
                  {/* Resumen de la sesión */}
                  <View style={{ backgroundColor: '#0f172a', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Resumen de Caja
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Vendedor</Text>
                      <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>{caja.vendedor_nombre}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Fondo Inicial</Text>
                      <Text style={{ color: '#f8fafc', fontSize: 12 }}>C${Number(caja.fondo_inicial).toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Total Ventas</Text>
                      <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '800' }}>C${Number(caja.total_ventas_sistema).toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Arqueo</Text>
                      <Text style={{ color: '#f8fafc', fontSize: 12 }}>C${Number(caja.efectivo_declarado).toFixed(2)}</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: '#1e293b', marginVertical: 6 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>Diferencia</Text>
                      <Text style={{ color: diferenciaColor, fontSize: 13, fontWeight: '800' }}>
                        {diferencia >= 0 ? '+' : ''}C${diferencia.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Lista de facturas */}
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Facturas ({ventasSesion.length}) · Total: C${totalSesion.toFixed(2)}
                  </Text>
                  <FlatList
                    data={ventasSesion}
                    keyExtractor={v => v.id.toString()}
                    style={{ maxHeight: 320 }}
                    ListEmptyComponent={<Text style={styles.emptyText}>No hay facturas en esta sesión.</Text>}
                    renderItem={({ item: v }) => (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#1e293b' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: '600' }}>
                            Factura #{v.id}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                            {v.cliente_nombre || 'Cliente General'} · {new Date(v.fecha).toLocaleString('es-ES', { timeStyle: 'short', timeZone: 'America/Managua' })}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '800' }}>C${Number(v.total).toFixed(2)}</Text>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}
                            onPress={() => handlePrintTicket(v.id)}
                          >
                            <Ionicons name="print-outline" size={12} color="#2563eb" />
                            <Text style={{ color: '#2563eb', fontSize: 10, fontWeight: '700' }}>Reimprimir</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  />
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>

      {/* MODAL SELECCIÓN CLIENTE */}
      <Modal
        visible={clientModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setClientModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccione un Cliente</Text>
              <TouchableOpacity onPress={() => setClientModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={clientes}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedClient(item);
                    setClientModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.nombre}</Text>
                  <Ionicons name="chevron-forward-outline" size={16} color="#475569" />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
              ListEmptyComponent={<Text style={styles.emptyText}>No hay clientes disponibles</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* MODAL SELECCIÓN PRODUCTO (+ Añadir más productos) */}
      <Modal
        visible={productModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setProductModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccione un Producto</Text>
              <TouchableOpacity onPress={() => setProductModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={productos}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    addToCart(item);
                    setProductModalVisible(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemText}>{item.nombre}</Text>
                    <Text style={styles.modalItemSub}>Stock: {item.stock} u. | Categoria: {item.categoria_nombre}</Text>
                  </View>
                  <Text style={styles.modalItemPrice}>C$${Number(item.precio).toFixed(2)}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
              ListEmptyComponent={<Text style={styles.emptyText}>No hay productos en catálogo</Text>}
            />
          </View>
        </View>
      </Modal>

      {/* MODAL REGISTRAR NUEVO CLIENTE */}
      <Modal
        visible={newClientModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setNewClientModalVisible(false)}
      >
        <View style={styles.modalCenterOverlay}>
          <View style={styles.modalCenterContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar Nuevo Cliente</Text>
              <TouchableOpacity onPress={() => setNewClientModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre del Cliente</Text>
                <TextInput
                  style={styles.formInput}
                  value={newClientNombre}
                  onChangeText={setNewClientNombre}
                  placeholder="Ej. Sofía Rodríguez"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Teléfono</Text>
                <TextInput
                  style={styles.formInput}
                  value={newClientTelefono}
                  onChangeText={setNewClientTelefono}
                  placeholder="Ej. 555-0122"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Correo Electrónico</Text>
                <TextInput
                  style={styles.formInput}
                  value={newClientEmail}
                  onChangeText={setNewClientEmail}
                  placeholder="sofia@email.com"
                  placeholderTextColor="#64748b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Dirección (Opcional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={newClientDireccion}
                  onChangeText={setNewClientDireccion}
                  placeholder="Ej. Calle Pino #123, León"
                  placeholderTextColor="#64748b"
                />
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveClient}
                disabled={submittingClient}
              >
                {submittingClient ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Registrar Cliente</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL APERTURA DE CAJA */}
      <Modal
        visible={aperturaModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAperturaModalVisible(false)}
      >
        <View style={styles.modalCenterOverlay}>
          <View style={styles.modalCenterContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apertura de Caja</Text>
              <TouchableOpacity onPress={() => setAperturaModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 16 }}>
                Ingrese el monto inicial en efectivo con el que se abre la caja el día de hoy.
              </Text>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Monto de Apertura (C$) *</Text>
                <TextInput
                  style={styles.formInput}
                  value={montoApertura}
                  onChangeText={setMontoApertura}
                  placeholder="1000.00"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#10b981', marginTop: 10 }]}
                onPress={submitAperturaCaja}
                disabled={submittingApertura}
              >
                {submittingApertura ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Registrar Apertura y Abrir Caja</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL AUTORIZACIÓN ADMIN PARA PRE-CIERRE DE CAJA */}
      <Modal
        visible={adminAuthModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAdminAuthModalVisible(false)}
      >
        <View style={styles.modalCenterOverlay}>
          <View style={styles.modalCenterContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Autorización de Admin</Text>
              <TouchableOpacity onPress={() => setAdminAuthModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            {submittingAdminAuth ? (
              <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
                <ActivityIndicator size="large" color="#f59e0b" style={{ marginBottom: 16 }} />
                <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
                  Sincronizando caja...
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                  Se están sincronizando documentos pendientes en el servidor. Por favor espere...
                </Text>
              </View>
            ) : (
              <ScrollView>
                <Text style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 16 }}>
                  Ingrese el correo y contraseña del administrador para autorizar el pre-cierre de caja.
                </Text>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Correo del Administrador *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={adminEmail}
                    onChangeText={setAdminEmail}
                    placeholder="admin@email.com"
                    placeholderTextColor="#64748b"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Contraseña *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={adminPassword}
                    onChangeText={setAdminPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#64748b"
                    secureTextEntry={true}
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: '#f59e0b' }]}
                  onPress={handleAutorizarCierreCaja}
                  disabled={submittingAdminAuth}
                >
                  <Ionicons name="key-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitButtonText}>Autorizar Pre-cierre</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
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
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    color: '#f8fafc',
    marginTop: 12,
    fontSize: 15
  },
  loaderLogoOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    marginBottom: 16,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3
  },
  loaderLogoInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderBrandText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  loaderMessageText: {
    fontSize: 12,
    color: '#f8fafc',
    marginTop: 10,
    fontWeight: '600',
    letterSpacing: 0.5
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
  resumenGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  resumenCard: {
    width: '48%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center'
  },
  resumenNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc'
  },
  resumenLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14
  },
  categoryChipsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingVertical: 4
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
    height: 32
  },
  categoryChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  categoryChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  categoryChipTextActive: {
    color: '#ffffff'
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20
  },
  emptyCartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    marginBottom: 14
  },
  emptySubText: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4
  },
  productCard: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc'
  },
  productCategory: {
    fontSize: 11,
    color: '#2563eb',
    marginTop: 2,
    fontWeight: '600'
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981'
  },
  productDesc: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 10
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b'
  },
  stockLabel: {
    fontSize: 12,
    color: '#94a3b8'
  },
  stockValue: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6
  },
  stockNormal: {
    color: '#cbd5e1'
  },
  stockLow: {
    color: '#f87171'
  },
  quickBillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4
  },
  quickBillButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  saleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  saleClient: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc'
  },
  saleDate: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  saleTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10b981'
  },
  saleStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 2
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
  clientFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  newClientButtonLink: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2
  },
  newClientButtonLinkText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600'
  },
  pickerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    height: 48,
    paddingHorizontal: 12
  },
  pickerPlaceholderText: {
    color: '#64748b',
    fontSize: 14
  },
  pickerSelectedText: {
    color: '#f8fafc',
    fontSize: 14
  },
  stockHint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    fontStyle: 'italic'
  },
  formInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    height: 48,
    paddingHorizontal: 12,
    color: '#f8fafc',
    fontSize: 14
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    borderRadius: 6,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#334155'
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
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  modalItemText: {
    fontSize: 14,
    color: '#e2e8f0',
    fontWeight: '500'
  },
  modalItemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  modalItemPrice: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '700'
  },
  modalSeparator: {
    height: 1,
    backgroundColor: '#334155'
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
    borderColor: '#2563eb'
  },
  tabBarText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500'
  },
  tabBarTextActive: {
    color: '#2563eb',
    fontWeight: '600'
  },
  modalCenterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 20
  },
  modalCenterContent: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '90%'
  },
  // Nuevos estilos de Carrito
  addButtonMiniBlue: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.3)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  addButtonMiniBlueText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700'
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cartItemName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  cartItemSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12
  },
  qtyButton: {
    backgroundColor: '#1e293b',
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  qtyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  qtyText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    width: 24,
    textAlign: 'center'
  },
  cartItemTotal: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 50,
    textAlign: 'right'
  },
  removeCartItemIcon: {
    padding: 6,
    marginLeft: 6
  },
  cartTotalSummary: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 12,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  cartTotalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  cartTotalLineLabel: {
    color: '#94a3b8',
    fontSize: 12
  },
  cartTotalLineVal: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600'
  },
  cartTotalLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  cartTotalValue: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '800'
  },
  // === ESTILOS DE CAJA ===
  cajaStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 4
  },
  cajaStatusTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700'
  },
  cajaStatusSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2
  },
  cajaCierreBadge: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)'
  },
  cajaCierreBadgeText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '700'
  }
});

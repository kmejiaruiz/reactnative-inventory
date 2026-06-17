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
import { API_URL } from '../config';

export default function VendedorDashboard({ token, user, onLogout }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('productos'); // 'productos', 'ventas', 'nueva_venta'

  // Estados de búsqueda y filtros
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' o ID de categoría

  // Carrito de compras (Múltiples Artículos)
  const [cart, setCart] = useState([]); // Array: { producto_id, nombre, precio, cantidad, stock }

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
        Alert.alert('Éxito', 'Venta comercial facturada con éxito.');
        setCart([]); // Limpiar carrito
        fetchVendedorData();
        setActiveTab('ventas');
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
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando datos de ventas...</Text>
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
  const cartSubtotal = cartTotal / 1.16; // Desglosar IVA 16%
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
            <Text style={styles.resumenNumber}>${Number(resumen.totalVendido).toFixed(2)}</Text>
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
                    <Text style={styles.productPrice}>${Number(item.precio).toFixed(2)}</Text>
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
              <Text style={styles.panelTitle}>Historial de Transacciones</Text>
              <TouchableOpacity onPress={fetchVendedorData}>
                <Ionicons name="refresh-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {ventas.length === 0 ? (
              <Text style={styles.emptyText}>Aún no has registrado ninguna venta.</Text>
            ) : (
              ventas.map((item) => (
                <View key={item.id} style={styles.saleItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.saleClient}>{item.cliente_nombre}</Text>
                    <Text style={styles.saleDate}>
                      {new Date(item.fecha).toLocaleString('es-ES', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'UTC',
                        hour12: false
                      })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.saleTotal}>${Number(item.total).toFixed(2)}</Text>
                    <Text style={styles.saleStatus}>{item.estado.toUpperCase()}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Create Sale Form (Carrito Facturación) */}
        {activeTab === 'nueva_venta' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Facturar Venta (Múltiples Artículos)</Text>
              <TouchableOpacity style={styles.addButtonMiniBlue} onPress={() => setProductModalVisible(true)}>
                <Text style={styles.addButtonMiniBlueText}>+ Añadir Licor</Text>
              </TouchableOpacity>
            </View>

            {/* Listado del Carrito */}
            {cart.length === 0 ? (
              <View style={styles.emptyCartBox}>
                <Ionicons name="cart-outline" size={40} color="#64748b" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>El carrito está vacío.</Text>
                <Text style={styles.emptySubText}>Agregue productos desde la pestaña 'Catálogo' o use el botón '+ Añadir Licor'.</Text>
              </View>
            ) : (
              cart.map((item) => (
                <View key={item.producto_id} style={styles.cartItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartItemName}>{item.nombre}</Text>
                    <Text style={styles.cartItemSub}>Precio Unitario: ${item.precio.toFixed(2)}</Text>
                  </View>
                  
                  {/* Cantidades y Controles */}
                  <View style={styles.cartItemActions}>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQty(item.producto_id, item.cantidad - 1)}>
                      <Text style={styles.qtyButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.cantidad}</Text>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQty(item.producto_id, item.cantidad + 1)}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.cartItemTotal}>
                    ${(item.cantidad * item.precio).toFixed(2)}
                  </Text>

                  <TouchableOpacity style={styles.removeCartItemIcon} onPress={() => updateCartQty(item.producto_id, 0)}>
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
                    <Text style={styles.cartTotalLineVal}>${cartSubtotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.cartTotalLine}>
                    <Text style={styles.cartTotalLineLabel}>IVA Cobrado (16%):</Text>
                    <Text style={styles.cartTotalLineVal}>${cartIva.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.cartTotalLine, { borderTopWidth: 1, borderColor: '#334155', paddingTop: 8, marginTop: 4 }]}>
                    <Text style={styles.cartTotalLabel}>Total a Pagar:</Text>
                    <Text style={styles.cartTotalValue}>${cartTotal.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Select Cliente */}
                <View style={styles.formGroup}>
                  <View style={styles.clientFormHeader}>
                    <Text style={styles.formLabel}>Cliente (Opcional)</Text>
                    <TouchableOpacity
                      style={styles.newClientButtonLink}
                      onPress={() => setNewClientModalVisible(true)}
                    >
                      <Ionicons name="person-add-outline" size={14} color="#2563eb" style={{ marginRight: 4 }} />
                      <Text style={styles.newClientButtonLinkText}>+ Registrar Nuevo</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.pickerSelector}
                    onPress={() => setClientModalVisible(true)}
                  >
                    <Text style={selectedClient ? styles.pickerSelectedText : styles.pickerPlaceholderText}>
                      {selectedClient ? selectedClient.nombre : 'Cliente General'}
                    </Text>
                    <Ionicons name="chevron-down-outline" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleCreateSale}
                  disabled={submitting}
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
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* BOTTOM TAB BAR (Menú Inferior) */}
      <View style={[styles.bottomTabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'productos' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('productos')}
        >
          <Ionicons
            name={activeTab === 'productos' ? 'cube' : 'cube-outline'}
            size={20}
            color={activeTab === 'productos' ? '#2563eb' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'productos' && styles.tabBarTextActive]}>Catálogo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'ventas' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('ventas')}
        >
          <Ionicons
            name={activeTab === 'ventas' ? 'receipt' : 'receipt-outline'}
            size={20}
            color={activeTab === 'ventas' ? '#2563eb' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'ventas' && styles.tabBarTextActive]}>Mis Ventas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'nueva_venta' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('nueva_venta')}
        >
          <Ionicons
            name={activeTab === 'nueva_venta' ? 'cart' : 'cart-outline'}
            size={20}
            color={activeTab === 'nueva_venta' ? '#2563eb' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'nueva_venta' && styles.tabBarTextActive]}>
            Facturar {cartCount > 0 ? `(${cartCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

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

      {/* MODAL SELECCIÓN PRODUCTO (+ Añadir Licor) */}
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
                  <Text style={styles.modalItemPrice}>${Number(item.precio).toFixed(2)}</Text>
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
  }
});

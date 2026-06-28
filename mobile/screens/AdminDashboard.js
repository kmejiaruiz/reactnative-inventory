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
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConsultorDashboard from './ConsultorDashboard';
import VendedorDashboard from './VendedorDashboard';

const formatNicaraguaDate = (dateVal) => {
  if (!dateVal) return '';
  if (typeof dateVal === 'string' && dateVal.includes('-') && dateVal.length === 10) {
    // YYYY-MM-DD -> DD/MM/YYYY
    const parts = dateVal.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  try {
    return d.toLocaleDateString('es-NI', {
      timeZone: 'America/Managua',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (e) {
    return d.toLocaleDateString();
  }
};

export default function AdminDashboard({ token, user, onLogout }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'compras', 'inventario', 'usuarios', 'bitacora', 'facturar', 'conteos'
  const [sidebarVisible, setSidebarVisible] = useState(false);

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

  // Estados para Parametrizar Producto
  const [paramModalVisible, setParamModalVisible] = useState(false);
  const [paramProduct, setParamProduct] = useState(null);
  const [paramCosto, setParamCosto] = useState('0');
  const [paramIva, setParamIva] = useState('15');
  const [paramUtilidad, setParamUtilidad] = useState('30');
  const [submittingParam, setSubmittingParam] = useState(false);
  const [submittingGeneralDiscard, setSubmittingGeneralDiscard] = useState(false);

  // Estados para Crear Producto (Admin)
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [formProdNombre, setFormProdNombre] = useState('');
  const [formProdDescripcion, setFormProdDescripcion] = useState('');
  const [formProdCategoriaId, setFormProdCategoriaId] = useState(null);
  const [formProdCosto, setFormProdCosto] = useState('0');
  const [formProdIva, setFormProdIva] = useState('15');
  const [formProdUtilidad, setFormProdUtilidad] = useState('30');
  const [formProdStock, setFormProdStock] = useState('0');
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Estados para Movimientos de Inventario por Fechas
  const [mvtStartDateFilter, setMvtStartDateFilter] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [mvtEndDateFilter, setMvtEndDateFilter] = useState(new Date());
  const [mvtList, setMvtList] = useState([]);
  const [loadingMvts, setLoadingMvts] = useState(false);

  // Estados para Respaldo y Restauración de Base de Datos
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);

  // Estados de reporte de ventas por vendedor
  const [salesBySeller, setSalesBySeller] = useState({ totalTienda: 0, vendedores: [] });
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Estados para Kardex / Movimientos de inventario
  const [inventoryMovements, setInventoryMovements] = useState({ catalogStatus: [], movements: [] });

  // NUEVOS ESTADOS AÑADIDOS
  const [subTabCompras, setSubTabCompras] = useState('ordenes'); // 'ordenes', 'notas', 'proveedores'
  
  // Estados para Proveedores
  const [suppliers, setSuppliers] = useState([]);
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formSupNombre, setFormSupNombre] = useState('');
  const [formSupTelefono, setFormSupTelefono] = useState('');
  const [formSupEmail, setFormSupEmail] = useState('');
  const [formSupDireccion, setFormSupDireccion] = useState('');
  const [submittingSupplier, setSubmittingSupplier] = useState(false);

  // Verificación de contraseña admin para proveedores
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authPassword, setAuthPassword] = useState('');

  // Verificación de credenciales admin para eliminar proveedor
  const [deleteAuthModalVisible, setDeleteAuthModalVisible] = useState(false);
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState(null);
  const [deleteAdminEmail, setDeleteAdminEmail] = useState('');
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [submittingDeleteAuth, setSubmittingDeleteAuth] = useState(false);

  // Asociación de productos a proveedores
  const [associatingSupplier, setAssociatingSupplier] = useState(null);
  const [associateModalVisible, setAssociateModalVisible] = useState(false);
  const [catalogForAssociation, setCatalogForAssociation] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [savingAssociation, setSavingAssociation] = useState(false);

  // Desglose de factura para entrada
  const [receivingSubtotal, setReceivingSubtotal] = useState('');
  const [receivingIva, setReceivingIva] = useState('');

  // Estados para dropdown y filtro de productos por proveedor
  const [poProveedorId, setPoProveedorId] = useState(null);
  const [poCatalogFiltered, setPoCatalogFiltered] = useState([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // Estados para filtro de fecha en O.C. y Entradas
  const [poStartDateFilter, setPoStartDateFilter] = useState(null);
  const [poEndDateFilter, setPoEndDateFilter] = useState(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState('start'); // 'start' | 'end'
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Filtro de categorías para Kardex
  const [kardexCategoryFilter, setKardexCategoryFilter] = useState('all');
  const [categoriesList, setCategoriesList] = useState([]);
  const [kardexSearch, setKardexSearch] = useState('');

  // === ESTADOS: CAJA (Admin - Cierre) ===
  const [cierreEfectivo, setCierreEfectivo] = useState('');
  const [cierreObservaciones, setCierreObservaciones] = useState('');
  const [cierreResultado, setCierreResultado] = useState(null);
  const [submittingCierre, setSubmittingCierre] = useState(false);
  const [ventasHoyAdmin, setVentasHoyAdmin] = useState([]);
  const [totalHoyAdmin, setTotalHoyAdmin] = useState(0);
  const [loadingCierreCaja, setLoadingCierreCaja] = useState(false);

  // Estados para arqueo y selección de vendedor
  const [pendientesCierre, setPendientesCierre] = useState([]);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const [selectedPendiente, setSelectedPendiente] = useState(null);
  const [showPendientesDropdown, setShowPendientesDropdown] = useState(false);

  // Nuevos estados para arqueo, denominaciones y monitoreo
  const [denominaciones, setDenominaciones] = useState({ '1000': '', '500': '', '200': '', '100': '', '50': '', '20': '', '10': '', '5': '', '1': '' });
  const [cajasActivas, setCajasActivas] = useState([]);
  const [loadingCajasActivas, setLoadingCajasActivas] = useState(false);
  const [lastClosedBox, setLastClosedBox] = useState(null);
  const [lastClosedDenominaciones, setLastClosedDenominaciones] = useState(null);

  // Historial de cajas (admin)
  const [historialCajasAdmin, setHistorialCajasAdmin] = useState([]);
  const [loadingHistorialAdmin, setLoadingHistorialAdmin] = useState(false);
  const [sesionAdminVisible, setSesionAdminVisible] = useState(false);
  const [selectedSesionAdmin, setSelectedSesionAdmin] = useState(null); // { caja, ventas }
  const [loadingSesionAdmin, setLoadingSesionAdmin] = useState(false);

  const [aperturaModalVisible, setAperturaModalVisible] = useState(false);
  const [montoApertura, setMontoApertura] = useState('1000');
  const [submittingApertura, setSubmittingApertura] = useState(false);

  // === ESTADOS: BODEGAS ===
  const [bodegas, setBodegas] = useState([]);
  const [bodegaSeleccionada, setBodegaSeleccionada] = useState(null); // { tipo, nombre, items }
  const [loadingBodegas, setLoadingBodegas] = useState(false);
  const [subTabBodegas, setSubTabBodegas] = useState('resumen'); // 'resumen' | 'transferir' | 'movimientos'
  const [transferProductoId, setTransferProductoId] = useState(null);
  const [transferProductoNombre, setTransferProductoNombre] = useState('');
  const [transferOrigen, setTransferOrigen] = useState('principal');
  const [transferDestino, setTransferDestino] = useState('merma');
  const [transferCantidad, setTransferCantidad] = useState('');
  const [transferMotivo, setTransferMotivo] = useState('');
  const [transferCart, setTransferCart] = useState([]); // [{ producto_id, nombre, cantidad }]
  const [transferCartModalVisible, setTransferCartModalVisible] = useState(false);
  const [lastTransferResult, setLastTransferResult] = useState(null);
  const [transferProductSearch, setTransferProductSearch] = useState('');
  const [selectedTraslado, setSelectedTraslado] = useState(null);
  const [trasladoDetailModalVisible, setTrasladoDetailModalVisible] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [movimientosBodega, setMovimientosBodega] = useState([]);
  const [loadingMovimientos, setLoadingMovimientos] = useState(false);
  const [bodegaStockVisible, setBodegaStockVisible] = useState(null); // tipo de bodega cuyo stock se muestra en modal
  const [bodegaStockItems, setBodegaStockItems] = useState([]);
  const [loadingBodegaStock, setLoadingBodegaStock] = useState(false);
  const [bodegaStockModalVisible, setBodegaStockModalVisible] = useState(false);
  const [stockOrigenMap, setStockOrigenMap] = useState({}); // { producto_id: cantidad } de la bodega origen seleccionada
  const [loadingStockOrigen, setLoadingStockOrigen] = useState(false);

  // Funciones auxiliares para el calendario interactivo (inputdate personalizado)
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const monthsEs = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleSelectDay = (day) => {
    const selectedDate = new Date(calendarYear, calendarMonth, day);
    if (calendarTarget === 'start') {
      setPoStartDateFilter(selectedDate);
    } else if (calendarTarget === 'end') {
      setPoEndDateFilter(selectedDate);
    } else if (calendarTarget === 'mvt_start') {
      setMvtStartDateFilter(selectedDate);
    } else if (calendarTarget === 'mvt_end') {
      setMvtEndDateFilter(selectedDate);
    }
    setCalendarVisible(false);
  };


  const handleBackupDatabase = async () => {
    setBackupLoading(true);
    try {
      const response = await fetch(`${API_URL}/database/backup`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al conectar con la base de datos');
      }

      const backupJson = await response.json();
      
      // Escribir el archivo JSON localmente en el móvil
      const fileUri = `${FileSystem.documentDirectory}licostock_backup_${new Date().toISOString().slice(0,10)}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backupJson, null, 2), {
        encoding: FileSystem.EncodingType.UTF8
      });

      // Compartir el archivo
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Respaldar Base de Datos LICOSTOCK'
        });
      } else {
        Alert.alert('Éxito', `El respaldo se guardó en: ${fileUri}`);
      }
    } catch (error) {
      console.log('Error de respaldo:', error);
      Alert.alert('Error', 'No se pudo generar la copia de seguridad de la base de datos.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreDatabase = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selectedFile = result.assets[0];
      
      // Mostrar advertencia crítica de confirmación
      Alert.alert(
        '¡ADVERTENCIA CRÍTICA!',
        'Esta acción reemplazará toda la base de datos actual con los datos del archivo de respaldo seleccionado. Todos los cambios recientes se perderán de forma permanente e irreversible.\n\n¿Está absolutamente seguro de que desea continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sí, restaurar base de datos',
            style: 'destructive',
            onPress: () => proceedWithRestore(selectedFile.uri)
          }
        ]
      );
    } catch (error) {
      console.log('Error al seleccionar archivo:', error);
      Alert.alert('Error', 'Ocurrió un error al seleccionar el archivo de respaldo.');
    }
  };

  const proceedWithRestore = async (fileUri) => {
    setRestoreLoading(true);
    setRestoreProgress(0);

    // Intervalo para incrementar el progreso de forma realista
    let progressInterval = setInterval(() => {
      setRestoreProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 5;
      });
    }, 80);

    try {
      // Leer el contenido del archivo JSON
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8
      });

      let backupData;
      try {
        backupData = JSON.parse(fileContent);
      } catch (e) {
        throw new Error('El archivo seleccionado no tiene un formato JSON válido.');
      }

      // Validaciones básicas del respaldo
      if (!backupData.tables || !backupData.tables.usuarios || !backupData.tables.productos) {
        throw new Error('Estructura de respaldo incompleta. Faltan tablas críticas del sistema.');
      }

      // Enviar el payload al backend para restaurar
      const response = await fetch(`${API_URL}/database/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(backupData)
      });

      const resData = await response.json();
      clearInterval(progressInterval);

      if (response.ok) {
        setRestoreProgress(100);
        
        // Esperar un breve momento para que la barra se vea al 100%
        setTimeout(async () => {
          try {
            // Guardar la fecha del respaldo en AsyncStorage
            await AsyncStorage.setItem('@pending_restore_alert', backupData.fecha || new Date().toISOString());
          } catch (storageErr) {
            console.log('Error guardando alerta de restauración:', storageErr);
          }

          setRestoreLoading(false);

          Alert.alert(
            'Restauración Exitosa',
            'La base de datos de LICOSTOCK se ha restaurado con éxito. Se cerrará la sesión para sincronizar y actualizar todos los datos.',
            [
              {
                text: 'Aceptar',
                onPress: () => {
                  onLogout();
                }
              }
            ]
          );
        }, 400);
      } else {
        throw new Error(resData.mensaje || 'Error en el servidor al restaurar.');
      }
    } catch (error) {
      clearInterval(progressInterval);
      setRestoreLoading(false);
      console.log('Error de restauración:', error);
      Alert.alert('Fallo de Restauración', error.message || 'No se pudo aplicar el respaldo de la base de datos.');
    }
  };

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

      // Obtener reporte de ventas por vendedor
      const sellerReportRes = await fetch(`${API_URL}/reports/sales-by-seller`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (sellerReportRes.ok) {
        const reportData = await sellerReportRes.json();
        setSalesBySeller(reportData);
      }

      // Obtener movimientos de inventario (Kardex)
      const invMovementsRes = await fetch(`${API_URL}/reports/inventory-movements`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (invMovementsRes.ok) {
        const invData = await invMovementsRes.json();
        setInventoryMovements(invData);
      }

      // Obtener proveedores
      const supResponse = await fetch(`${API_URL}/proveedores`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (supResponse.ok) {
        const supData = await supResponse.json();
        setSuppliers(supData);
      }

      // Obtener categorías del catálogo
      const catResponse = await fetch(`${API_URL}/dashboard/consultor`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (catResponse.ok) {
        const catData = await catResponse.json();
        setCategoriesList(catData.categorias || []);
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

  useEffect(() => {
    if (activeTab === 'caja') {
      setCierreResultado(null);
      setSelectedPendiente(null);
      setLastClosedBox(null);
      setLastClosedDenominaciones(null);
      setDenominaciones({ '1000': '', '500': '', '200': '', '100': '', '50': '', '20': '', '10': '', '5': '', '1': '' });
      fetchPendientesCierre();
      fetchCajasActivas();
    }
    if (activeTab === 'bodegas') {
      fetchBodegas();
      if (subTabBodegas === 'movimientos') fetchMovimientosBodega();
      if (subTabBodegas === 'transferir') fetchStockOrigen(transferOrigen);
    }
  }, [activeTab, subTabBodegas]);

  useEffect(() => {
    if (activeTab === 'movimientos') {
      fetchMovementsByDates();
    }
  }, [activeTab]);

  // Recargar stock de origen cuando cambia la bodega de origen en el sub-tab transferir
  useEffect(() => {
    if (activeTab === 'bodegas' && subTabBodegas === 'transferir') {
      fetchStockOrigen(transferOrigen);
    }
  }, [transferOrigen]);

  useEffect(() => {
    if (selectedPendiente) {
      fetchVentasHoyVendedor(selectedPendiente.vendedor_id);
    } else {
      setVentasHoyAdmin([]);
      setTotalHoyAdmin(0);
    }
  }, [selectedPendiente]);

  const fetchCajasActivas = async () => {
    setLoadingCajasActivas(true);
    try {
      const resp = await fetch(`${API_URL}/caja/estado-cajas-activas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setCajasActivas(d);
      }
    } catch (e) {
      console.log('Error fetch cajas activas:', e);
    } finally {
      setLoadingCajasActivas(false);
    }
  };

  const fetchHistorialCajasAdmin = async () => {
    setLoadingHistorialAdmin(true);
    try {
      const resp = await fetch(`${API_URL}/caja/historial-cajas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setHistorialCajasAdmin(d);
      }
    } catch (e) { console.log('Error historial cajas admin:', e); }
    finally { setLoadingHistorialAdmin(false); }
  };

  const fetchVentasSesionAdmin = async (cajaId) => {
    setLoadingSesionAdmin(true);
    setSelectedSesionAdmin(null);
    setSesionAdminVisible(true);
    try {
      const resp = await fetch(`${API_URL}/caja/sesion-ventas/${cajaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setSelectedSesionAdmin(d);
      }
    } catch (e) { console.log('Error sesion admin:', e); }
    finally { setLoadingSesionAdmin(false); }
  };

  const handlePrintTicket = async (ventaId) => {
    try {
      const resp = await fetch(`${API_URL}/ventas/${ventaId}/detalle`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const d = await resp.json();
      const venta = d.venta;
      const items = d.items;
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

  const imprimirTicketCierre = async (cierreData, box, currentDenoms) => {
    try {
      const totalVentas = Number(cierreData.totalVentas || 0);
      const fondo = Number(cierreData.fondo || 1000);
      const esperado = Number(cierreData.efectivoEsperado || (totalVentas + fondo));
      const diferencia = Number(cierreData.diferencia || 0);
      const contado = esperado + diferencia;
      
      const fecha = new Date().toLocaleString('es-ES', { 
        dateStyle: 'short', 
        timeStyle: 'short', 
        timeZone: 'America/Managua' 
      });

      const formattedFechaCaja = formatNicaraguaDate(box.fecha_caja);

      // Desglose de denominaciones no vacias
      const denomsHtml = Object.keys(currentDenoms)
        .filter(den => parseInt(currentDenoms[den]) > 0)
        .map(den => {
          const qty = parseInt(currentDenoms[den]);
          const sub = parseInt(den) * qty;
          return `<tr>
            <td style="padding:2px 4px;font-size:11px">C$${den}</td>
            <td style="text-align:center;font-size:11px">${qty}</td>
            <td style="text-align:right;font-size:11px">C$${sub.toFixed(2)}</td>
          </tr>`;
        }).join('');

      const diffText = diferencia === 0 
        ? 'CUADRADO' 
        : diferencia > 0 
          ? `SOBRANTE (C$${diferencia.toFixed(2)})` 
          : `FALTANTE (C$${diferencia.toFixed(2)})`;

      const diffColor = diferencia === 0 
        ? '#000000' 
        : diferencia > 0 
          ? '#10b981' 
          : '#ef4444';

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        @page{size:80mm auto;margin:4mm}
        body{font-family:monospace;font-size:12px;color:#000;margin:0;padding:0}
        h2{text-align:center;font-size:13px;margin:0 0 2px;text-transform:uppercase}
        p{text-align:center;font-size:10px;margin:2px 0}
        hr{border:none;border-top:1px dashed #000;margin:6px 0}
        table{width:100%;border-collapse:collapse}
        th{font-size:10px;border-bottom:1px solid #000;padding:2px 4px;text-align:left}
        .total-row{font-weight:bold;font-size:11px}
        .grand-total{font-weight:bold;font-size:13px;text-align:right}
      </style></head><body>
      <h2>Arqueo de Caja y Cierre</h2>
      <p>Fecha Cierre: ${fecha}</p>
      <p>Caja del Día: ${formattedFechaCaja}</p>
      <hr/>
      <p style="text-align:left;font-size:11px"><b>Cajero:</b> ${box.vendedor_nombre || 'Vendedor'}</p>
      <p style="text-align:left;font-size:11px"><b>Cerrado Por:</b> ${user.nombre || 'Administrador'}</p>
      <hr/>
      <h2 style="font-size:11px;text-align:left;margin-bottom:4px">Desglose de Efectivo</h2>
      <table>
        <thead>
          <tr>
            <th style="padding:2px 4px;font-size:10px">Denom.</th>
            <th style="text-align:center;font-size:10px">Cant.</th>
            <th style="text-align:right;font-size:10px">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${denomsHtml || '<tr><td colspan="3" style="text-align:center;font-size:11px;padding:6px">No se ingresaron denominaciones.</td></tr>'}
        </tbody>
      </table>
      <hr/>
      <table>
        <tr><td style="font-size:11px">Total Ventas Sistema:</td><td style="text-align:right;font-size:11px">C$${totalVentas.toFixed(2)}</td></tr>
        <tr><td style="font-size:11px">Fondo Fijo Inicial:</td><td style="text-align:right;font-size:11px">C$${fondo.toFixed(2)}</td></tr>
        <tr><td style="font-size:11px;font-weight:bold">Efectivo Esperado:</td><td style="text-align:right;font-size:11px;font-weight:bold">C$${esperado.toFixed(2)}</td></tr>
        <tr class="total-row"><td>EFECTIVO FISICO CONTADO:</td><td class="grand-total">C$${contado.toFixed(2)}</td></tr>
      </table>
      <hr/>
      <p style="text-align:left;font-size:11px;font-weight:bold">Resultado del Arqueo:</p>
      <p style="text-align:left;font-size:12px;font-weight:bold;color:${diffColor};margin-top:2px">${diffText}</p>
      ${cierreData.observaciones ? `<hr/><p style="text-align:left;font-size:10px"><b>Observaciones:</b> ${cierreData.observaciones}</p>` : ''}
      <hr/>
      <p style="margin-top:8px">Comprobante de arqueo final de caja.</p>
      </body></html>`;

      await Print.printAsync({ html });
    } catch (err) {
      console.log('Error al imprimir ticket de arqueo:', err);
      Alert.alert('Error', 'No se pudo generar el ticket de arqueo.');
    }
  };

  const fetchPendientesCierre = async () => {
    setLoadingPendientes(true);
    setCierreResultado(null); // Limpiar resultado previo al actualizar
    try {
      const resp = await fetch(`${API_URL}/caja/pendientes-cierre`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setPendientesCierre(d);
        // No pre-seleccionar automáticamente, dejar en null para que el usuario elija.
        // Pero si ya había una seleccionada y sigue en la lista, la conservamos.
        if (selectedPendiente) {
          const stillPending = d.find(p => p.apertura_id === selectedPendiente.apertura_id);
          if (!stillPending) {
            setSelectedPendiente(null);
          }
        } else {
          setSelectedPendiente(null);
        }
      }
    } catch (e) {
      console.log('Error fetch pendientes:', e);
    } finally {
      setLoadingPendientes(false);
    }
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
        fetchCajasActivas();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo conectar al servidor.');
    } finally {
      setSubmittingApertura(false);
    }
  };

  const fetchVentasHoyVendedor = async (vendedorId) => {
    setLoadingCierreCaja(true);
    try {
      const resp = await fetch(`${API_URL}/caja/ventas-hoy?vendedorId=${vendedorId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setVentasHoyAdmin(d.ventas || []);
        setTotalHoyAdmin(d.totalDia || 0);
      }
    } catch (e) {
      console.log('Error fetch ventas hoy admin:', e);
    } finally {
      setLoadingCierreCaja(false);
    }
  };

  const fetchBodegas = async () => {
    setLoadingBodegas(true);
    try {
      const resp = await fetch(`${API_URL}/bodegas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) setBodegas(await resp.json());
    } catch (e) { console.log('Error bodegas:', e); }
    finally { setLoadingBodegas(false); }
  };

  const fetchMovimientosBodega = async () => {
    setLoadingMovimientos(true);
    try {
      const resp = await fetch(`${API_URL}/bodegas/movimientos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) setMovimientosBodega(await resp.json());
    } catch (e) { console.log('Error movimientos:', e); }
    finally { setLoadingMovimientos(false); }
  };

  const fetchBodegaStock = async (tipo) => {
    setLoadingBodegaStock(true);
    setBodegaStockItems([]);
    setBodegaStockVisible(tipo);
    setBodegaStockModalVisible(true);
    try {
      const resp = await fetch(`${API_URL}/bodegas/${tipo}/stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        setBodegaStockItems(d.items || []);
      }
    } catch (e) { console.log('Error stock bodega:', e); }
    finally { setLoadingBodegaStock(false); }
  };

  const handlePrintGeneralMermaDiscardReport = async (itemsToDiscard) => {
    if (!itemsToDiscard || itemsToDiscard.length === 0) return;

    let totalQty = 0;
    let totalImpact = 0;

    const itemsHtml = itemsToDiscard.map(item => {
      const qty = Number(item.cantidad) || 0;
      const costoUnit = Number(item.costo) || 0;
      const subtotal = qty * costoUnit;
      totalQty += qty;
      totalImpact += subtotal;

      return `
        <tr>
          <td>#${item.id}</td>
          <td><strong>${item.nombre}</strong></td>
          <td style="text-align:center;">${qty} u.</td>
          <td style="text-align:right;">C$${costoUnit.toFixed(2)}</td>
          <td style="text-align:right; font-weight:bold;">C$${subtotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Descarte General de Merma</title>
        <style>
          @page { size: letter; margin: 15mm; }
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.4; padding: 10px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
          .header p { font-size: 11px; margin: 5px 0 0 0; color: #555; }
          .meta-info { font-size: 11px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 11px; }
          th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; }
          .totales { font-size: 12px; margin-top: 15px; text-align: right; font-weight: bold; }
          .signature-row { margin-top: 60px; display: flex; justify-content: space-between; }
          .signature-line { width: 220px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>REPORTE DE DESCARTE GENERAL DE MERMA</h1>
          <p>Licorería LICOSTOCK | Baja Total de Inventario en Mermas</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Fecha/Hora:</strong> ${new Date().toLocaleString('es-NI', { timeZone: 'America/Managua' })}<br>
            <strong>Área:</strong> Control General de Bodegas<br>
          </div>
          <div>
            <strong>Autorizado por:</strong> ${user.nombre}<br>
            <strong>Rol:</strong> ${user.rol.toUpperCase()}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Ref ID</th>
              <th style="width: 48%;">Producto / Licor</th>
              <th style="width: 12%; text-align:center;">Cant. Descartada</th>
              <th style="width: 13%; text-align:right;">Costo Unit.</th>
              <th style="width: 15%; text-align:right;">Total Costo</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="totales">
          <p>Total Unidades Descartadas: ${totalQty} u.</p>
          <p style="font-size: 14px; color: #dc2626;">Total Impacto Financiero: C$${totalImpact.toFixed(2)}</p>
        </div>

        <div class="signature-row">
          <div class="signature-line">Entregado por (Firma)</div>
          <div class="signature-line">Autorizado por (Admin/Contador)</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir reporte descarte:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handleDiscardAllMerma = async () => {
    Alert.alert(
      'Confirmar Descarte',
      '¿Está seguro de que desea descartar TODOS los artículos registrados en la Bodega de Merma? Esta acción vaciará el stock de merma en el sistema y generará un reporte PDF oficial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar y Descartar',
          style: 'destructive',
          onPress: async () => {
            setSubmittingGeneralDiscard(true);
            try {
              const resp = await fetch(`${API_URL}/bodegas/merma/descartar`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                }
              });
              const resData = await resp.json();
              setSubmittingGeneralDiscard(false);

              if (resp.ok) {
                Alert.alert('Éxito', 'Descarte general de merma procesado.');
                // 1. Imprimir reporte PDF de los artículos descartados
                await handlePrintGeneralMermaDiscardReport(resData.items || []);
                // 2. Refrescar stock de la bodega
                fetchBodegaStock('merma');
                // 3. Refrescar listado de bodegas
                fetchBodegas();
              } else {
                Alert.alert('Error', resData.mensaje || 'No se pudo procesar el descarte.');
              }
            } catch (error) {
              setSubmittingGeneralDiscard(false);
              console.log('Error al descartar merma:', error);
              Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
            }
          }
        }
      ]
    );
  };

  const fetchStockOrigen = async (tipo) => {
    setLoadingStockOrigen(true);
    try {
      const resp = await fetch(`${API_URL}/bodegas/${tipo}/stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        const map = {};
        (d.items || []).forEach(item => { map[item.id] = item.cantidad; });
        setStockOrigenMap(map);
      }
    } catch (e) { console.log('Error cargando stock origen:', e); }
    finally { setLoadingStockOrigen(false); }
  };

  const handleCierreCaja = async () => {
    if (!selectedPendiente) {
      Alert.alert('Aviso', 'No se ha seleccionado ninguna caja pendiente de cierre.');
      return;
    }

    const totalCalculado = Object.keys(denominaciones).reduce((acc, den) => acc + (parseInt(den) * (parseInt(denominaciones[den]) || 0)), 0);
    const totalEsperado = totalHoyAdmin + 1000.00;

    Alert.alert(
      'Confirmar Cierre de Caja',
      `Vendedor: ${selectedPendiente.vendedor_nombre}\nEfectivo contado: C$${totalCalculado.toFixed(2)}\nEfectivo esperado (Ventas + Fondo): C$${totalEsperado.toFixed(2)}\n¿Confirmar cierre?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setSubmittingCierre(true);
            try {
              // Compilar desglose de denominaciones
              const desgloseText = Object.keys(denominaciones)
                .filter(den => (parseInt(denominaciones[den]) || 0) > 0)
                .map(den => `${den}x${denominaciones[den]}`)
                .join(', ');
              const observacionesFinales = desgloseText 
                ? `[Desglose: ${desgloseText}]${cierreObservaciones ? ` | Obs: ${cierreObservaciones}` : ''}`
                : cierreObservaciones;

              const resp = await fetch(`${API_URL}/caja/cierre`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  efectivo_declarado: totalCalculado,
                  observaciones: observacionesFinales,
                  vendedor_id: selectedPendiente.vendedor_id
                })
              });
              const d = await resp.json();
              if (resp.ok) {
                // Imprimir ticket de cierre de inmediato antes de limpiar el estado
                const printData = { ...d, observaciones: cierreObservaciones };
                await imprimirTicketCierre(printData, selectedPendiente, denominaciones);

                setCierreResultado(printData);
                setCierreEfectivo('');
                setLastClosedBox(selectedPendiente);
                setLastClosedDenominaciones(denominaciones);
                setCierreObservaciones('');
                setDenominaciones({ '1000': '', '500': '', '200': '', '100': '', '50': '', '20': '', '10': '', '5': '', '1': '' });
                setSelectedPendiente(null);
                
                fetchPendientesCierre(); // Refrescar lista de cajas pendientes
                fetchCajasActivas(); // Refrescar lista de cajas de monitoreo
              } else {
                Alert.alert('Error', d.mensaje || 'No se pudo registrar el cierre.');
              }
            } catch (e) {
              Alert.alert('Error de red', 'No se pudo conectar al servidor.');
            } finally {
              setSubmittingCierre(false);
            }
          }
        }
      ]
    );
  };

  const handleAddProductToTransfer = () => {
    if (!transferProductoId || !transferCantidad || parseInt(transferCantidad) <= 0) {
      Alert.alert('Datos Incompletos', 'Seleccione un producto e ingrese la cantidad.');
      return;
    }

    const qty = parseInt(transferCantidad);
    const existingIndex = transferCart.findIndex(item => item.producto_id === transferProductoId);

    if (existingIndex > -1) {
      const updated = [...transferCart];
      updated[existingIndex].cantidad += qty;
      setTransferCart(updated);
    } else {
      setTransferCart([...transferCart, {
        producto_id: transferProductoId,
        nombre: transferProductoNombre,
        cantidad: qty
      }]);
    }

    // Resetear seleccion de producto y cantidad
    setTransferProductoId(null);
    setTransferProductoNombre('');
    setTransferCantidad('');
  };

  const handleRemoveProductFromTransfer = (prodId) => {
    setTransferCart(transferCart.filter(item => item.producto_id !== prodId));
  };

  const imprimirReporteTraslado = async (transferData) => {
    if (!transferData) {
      Alert.alert('Error', 'No hay datos de traslado para imprimir.');
      return;
    }
    const { bodega_origen, bodega_destino, motivo, items, fecha, usuario } = transferData;
    const fechaObj = new Date(fecha);
    const fechaFormateada = fechaObj.toLocaleString('es-NI', { timeZone: 'America/Managua' });

    let tableRows = '';
    items.forEach((it) => {
      tableRows += `
        <tr>
          <td style="padding: 8px; border: 1px solid #000; text-align: center; font-size: 12px;">#${it.producto_id}</td>
          <td style="padding: 8px; border: 1px solid #000; font-size: 12px; font-weight: bold;">${it.nombre}</td>
          <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 12px; font-weight: bold;">${it.cantidad} u.</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Comprobante de Traslado de Bodega</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #000;
            margin: 20px;
            background-color: #fff;
          }
          .title {
            font-size: 18px;
            font-weight: bold;
            text-transform: uppercase;
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 5px;
            margin-bottom: 20px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
          }
          .meta-table td {
            padding: 4px 0;
            font-size: 12px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }
          .items-table th {
            background-color: #f2f2f2;
            border: 1px solid #000;
            padding: 8px;
            font-size: 12px;
            text-align: left;
            font-weight: bold;
          }
          .signatures-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 50px;
          }
          .signatures-table td {
            width: 33.33%;
            text-align: center;
            font-size: 11px;
            vertical-align: bottom;
            padding-top: 40px;
          }
          .signature-line {
            border-top: 1px solid #000;
            width: 80%;
            margin: 0 auto 5px auto;
          }
        </style>
      </head>
      <body>
        <div class="title">Comprobante Oficial de Traslado de Bodega</div>
        
        <table class="meta-table">
          <tr>
            <td style="width: 20%; font-weight: bold;">Bodega Origen:</td>
            <td style="width: 30%; text-transform: uppercase;">${bodega_origen}</td>
            <td style="width: 20%; font-weight: bold;">Fecha y Hora:</td>
            <td style="width: 30%;">${fechaFormateada}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Bodega Destino:</td>
            <td style="text-transform: uppercase;">${bodega_destino}</td>
            <td style="font-weight: bold;">Autorizado por:</td>
            <td>${usuario}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Motivo:</td>
            <td colspan="3">${motivo || 'No especificado'}</td>
          </tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">ID Ref.</th>
              <th style="width: 60%;">Descripción del Licor / Producto</th>
              <th style="width: 25%; text-align: right;">Cantidad Trasladada</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <table class="signatures-table">
          <tr>
            <td>
              <div class="signature-line"></div>
              Entregado Por (Firma)
            </td>
            <td>
              <div class="signature-line"></div>
              Recibido Por (Firma)
            </td>
            <td>
              <div class="signature-line"></div>
              Autorizado Por (Admin)
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir reporte de traslado:', error);
      Alert.alert('Error', 'No se pudo generar el reporte del traslado.');
    }
  };

  const handleTransferirBodega = async () => {
    if (transferCart.length === 0) {
      Alert.alert('Borrador Vacio', 'Debe agregar al menos un producto al traslado.');
      return;
    }
    if (transferOrigen === transferDestino) {
      Alert.alert('Error', 'La bodega de origen y destino deben ser diferentes.');
      return;
    }
    setSubmittingTransfer(true);
    try {
      const resp = await fetch(`${API_URL}/bodegas/transferir`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: transferCart,
          bodega_origen_tipo: transferOrigen,
          bodega_destino_tipo: transferDestino,
          motivo: transferMotivo
        })
      });
      const d = await resp.json();
      
      if (resp.ok) {
        setTransferMotivo('');
        setTransferCart([]);
        setTransferCartModalVisible(false);
        fetchBodegas();

        const transDetails = d.detalles;
        setLastTransferResult(transDetails);

        Alert.alert(
          'Exito',
          d.mensaje || 'Transferencia ejecutada correctamente.',
          [
            { text: 'Ok' },
            {
              text: 'Imprimir Reporte',
              onPress: () => imprimirReporteTraslado(transDetails)
            }
          ]
        );
      } else {
        Alert.alert('Error en Transferencia', d.mensaje || 'No se pudo realizar el traslado.');
      }
    } catch (e) {
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    } finally {
      setSubmittingTransfer(false);
    }
  };


  // --- MÓDULO DE REPORTES: IMPRESIÓN Y EXPORTACIÓN A EXCEL ---
  
  const handleExportCSV = async (title, headers, rows, filename) => {
    try {
      let csvContent = '\uFEFF'; // BOM UTF-8 para Excel en español
      csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
      
      rows.forEach(row => {
        csvContent += row.map(cell => {
          const cellStr = cell !== null && cell !== undefined ? String(cell) : '';
          return `"${cellStr.replace(/"/g, '""')}"`;
        }).join(',') + '\n';
      });

      const fileUri = `${FileSystem.documentDirectory}${filename}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: 'utf8'
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: `Exportar ${title}`,
        UTI: 'public.comma-separated-values-text'
      });
    } catch (error) {
      console.log('Error al exportar CSV:', error);
      Alert.alert('Error', 'No se pudo exportar el archivo a Excel.');
    }
  };

  const handlePrintSalesReport = async () => {
    const sellersHtml = salesBySeller.vendedores.map(item => `
      <tr>
        <td><strong>${item.nombre}</strong><br><span style="color:#666;font-size:10px;">${item.email}</span></td>
        <td style="text-align:center;">${item.cantidadVentas}</td>
        <td style="text-align:right;font-weight:bold;">C$${item.totalVendido.toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Ventas por Vendedor</title>
        <style>
          @page { size: letter; margin: 15mm; }
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.4; padding: 10px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
          .header p { font-size: 11px; margin: 5px 0 0 0; color: #555; }
          .meta-info { font-size: 11px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 11px; }
          th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; }
          .total-block { margin-top: 25px; border-top: 2px solid #000; padding-top: 12px; text-align: right; font-size: 13px; font-weight: bold; }
          .signature-block { margin-top: 50px; display: flex; justify-content: flex-end; }
          .signature-line { width: 250px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>HOJA DE REPORTE - CONTROL DE VENTAS POR VENDEDOR</h1>
          <p>Licorería | Módulo de Auditoría Comercial</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Generado por:</strong> ${user.nombre} (Administrador)<br>
            <strong>Fecha de Emisión:</strong> ${new Date().toLocaleString('es-ES')}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Vendedor / Correo</th>
              <th style="width: 25%; text-align:center;">Cant. Ventas</th>
              <th style="width: 25%; text-align:right;">Total Vendido</th>
            </tr>
          </thead>
          <tbody>
            ${sellersHtml}
          </tbody>
        </table>
        <div class="total-block">
          VENTAS TOTALES TIENDA (IVA Inc.): C$${salesBySeller.totalTienda.toFixed(2)}
        </div>
        <div class="signature-block">
          <div class="signature-line">Firma Administrador</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir ventas:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handleExportSalesReportExcel = () => {
    const headers = ['Vendedor', 'Correo', 'Cant. Ventas', 'Total Vendido'];
    const rows = salesBySeller.vendedores.map(item => [
      item.nombre,
      item.email,
      item.cantidadVentas,
      item.totalVendido.toFixed(2)
    ]);
    rows.push(['VENTAS TOTALES TIENDA', '', '', salesBySeller.totalTienda.toFixed(2)]);
    
    handleExportCSV('Ventas por Vendedor', headers, rows, 'reporte_ventas_vendedores');
  };

  const handlePrintInventory = async (catId) => {
    // Filtrar catálogo según categoría seleccionada
    const filteredProducts = (inventoryMovements.catalogStatus || []).filter(item => {
      if (!catId || catId === 'all') return true;
      const cat = categoriesList.find(c => c.id === catId);
      return cat ? item.categoria === cat.nombre : true;
    });

    const categoryName = catId === 'all' ? 'TODAS' : (categoriesList.find(c => c.id === catId)?.nombre || 'FILTRADO');

    const catalogHtml = filteredProducts.map(item => `
      <tr>
        <td>#${item.id}</td>
        <td><strong>${item.nombre}</strong></td>
        <td>${item.categoria}</td>
        <td style="text-align:center;">${item.stock} u.</td>
        <td style="text-align:right;">C$${item.precio.toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold;">C$${item.valorTotal.toFixed(2)}</td>
      </tr>
    `).join('');

    const totalAlmacen = filteredProducts.reduce((acc, curr) => acc + curr.valorTotal, 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Existencias de Inventario</title>
        <style>
          @page { size: letter; margin: 15mm; }
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.4; padding: 10px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
          .header p { font-size: 11px; margin: 5px 0 0 0; color: #555; }
          .meta-info { font-size: 11px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
          th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; }
          .total-line { font-size: 12px; font-weight: bold; text-align: right; margin-top: 20px; border-top: 2px solid #000; padding-top: 10px; }
          .signature-block { margin-top: 50px; display: flex; justify-content: flex-end; }
          .signature-line { width: 250px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>REPORTE DE EXISTENCIAS DE INVENTARIO</h1>
          <p>Licorería | Auditoría de Almacén</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Generado por:</strong> ${user.nombre} (Administrador)<br>
            <strong>Categoría:</strong> ${categoryName}<br>
            <strong>Fecha de Emisión:</strong> ${new Date().toLocaleString('es-ES')}
          </div>
          <div>
            <strong>Productos Listados:</strong> ${filteredProducts.length}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 10%;">ID Ref</th>
              <th style="width: 40%;">Licor / Producto</th>
              <th style="width: 18%;">Categoría</th>
              <th style="width: 12%; text-align:center;">Existencia</th>
              <th style="width: 10%; text-align:right;">Precio</th>
              <th style="width: 10%; text-align:right;">Valorizado</th>
            </tr>
          </thead>
          <tbody>
            ${catalogHtml}
          </tbody>
        </table>
        <div class="total-line">VALOR TOTAL EXPORTADO: C$${totalAlmacen.toFixed(2)}</div>
        <div class="signature-block">
          <div class="signature-line">Firma Administrador</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir inventario:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handlePrintMovements = async () => {
    const movementsHtml = (inventoryMovements.movements || []).map(item => {
      const qtySign = item.cantidad >= 0 ? '+' : '';
      return `
        <tr>
          <td>${new Date(item.fecha).toLocaleString('es-ES', { hour12: false })}</td>
          <td><strong>${item.tipo}</strong></td>
          <td>${item.productoNombre}</td>
          <td style="text-align:center;font-weight:bold;color:#000;">${qtySign}${item.cantidad} u.</td>
          <td>${item.referencia}</td>
          <td>${item.responsable}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Movimientos de Inventario - Kardex</title>
        <style>
          @page { size: letter; margin: 15mm; }
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.4; padding: 10px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
          .header p { font-size: 11px; margin: 5px 0 0 0; color: #555; }
          .meta-info { font-size: 11px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
          th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; }
          .signature-block { margin-top: 50px; display: flex; justify-content: flex-end; }
          .signature-line { width: 250px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>REPORTE DE MOVIMIENTOS DE INVENTARIO (KARDEX)</h1>
          <p>Licorería | Control e Historial de Movimientos</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Generado por:</strong> ${user.nombre} (Administrador)<br>
            <strong>Fecha de Emisión:</strong> ${new Date().toLocaleString('es-ES')}
          </div>
          <div>
            <strong>Movimientos Listados:</strong> ${inventoryMovements.movements ? inventoryMovements.movements.length : 0}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 22%;">Fecha / Hora</th>
              <th style="width: 12%;">Tipo</th>
              <th style="width: 28%;">Licor / Producto</th>
              <th style="width: 12%; text-align:center;">Cantidad</th>
              <th style="width: 13%;">Referencia</th>
              <th style="width: 13%;">Responsable</th>
            </tr>
          </thead>
          <tbody>
            ${movementsHtml}
          </tbody>
        </table>
        <div class="signature-block">
          <div class="signature-line">Firma Administrador</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir movimientos:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handlePrintPurchaseOrder = async (poId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/purchase-orders/${poId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoading(false);
      if (!response.ok) {
        Alert.alert('Error', resData.mensaje || 'No se pudo obtener detalles de la orden de compra.');
        return;
      }

      const po = resData.header;
      const items = resData.items;
      const debitNote = resData.debitNote;
      
      const isApplied = po.estado === 'ingresado' || po.estado === 'discrepancia';
      const titleReport = isApplied ? 'Entrada de Mercadería' : 'Orden de Compra (O.C.)';
      const subtitleReport = isApplied ? 'Licorería | Módulo de Entrada de Mercadería e Inventario' : 'Licorería | Módulo de Abastecimiento e Inventario';
      const idLabel = isApplied ? 'Entrada ID' : 'Orden de Compra ID';

      let totalCostoEntrada = 0;
      const itemsHtml = items.map((item, idx) => {
        const qty = isApplied ? (item.cantidad_recibida ?? item.cantidad_ordenada) : item.cantidad_ordenada;
        const itemSubtotal = qty * item.costo_unitario;
        if (isApplied) {
          totalCostoEntrada += itemSubtotal;
        }
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td>${item.producto_nombre}</td>
            <td style="text-align:center;">${qty}</td>
            <td style="text-align:right;">C$${Number(item.costo_unitario).toFixed(2)}</td>
            <td style="text-align:right;font-weight:bold;">C$${itemSubtotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      const subTotalFact = debitNote ? Number(debitNote.factura_subtotal) : Number(po.total_costo);
      const ivaFact = debitNote ? Number(debitNote.factura_iva) : Number(po.iva);
      const totalFact = subTotalFact + ivaFact;

      const ivaEntrada = totalCostoEntrada * 0.15;
      const totalEntradaVal = totalCostoEntrada + ivaEntrada;

      let debitNoteHtml = '';
      if (isApplied && debitNote) {
        debitNoteHtml = `
          <div style="page-break-before: always; padding-top: 30px; margin-top: 30px;">
            <div class="header">
              <h1 style="color: #000; border-bottom: 2px solid #000; padding-bottom: 8px;">NOTA DE DÉBITO A PROVEEDOR</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Licorería | Módulo de Auditoría de Compras</p>
            </div>
            <div class="meta-info">
              <div>
                <strong>Nota de Débito ID:</strong> #${debitNote.id}<br>
                <strong>Proveedor:</strong> ${po.proveedor_nombre}<br>
                <strong>Entrada Asociada:</strong> #${debitNote.orden_compra_id} (Fecha: ${formatNicaraguaDate(po.fecha_creacion)})<br>
                <strong>Factura Proveedor:</strong> ${debitNote.factura_proveedor}
              </div>
              <div>
                <strong>Fecha Emisión:</strong> ${new Date(debitNote.fecha_creacion).toLocaleString('es-NI', { timeZone: 'America/Managua' })}<br>
                <strong>Emitido por:</strong> ${user.nombre}<br>
                <strong>Tipo Discrepancia:</strong> ${debitNote.tipo.toUpperCase()}
              </div>
            </div>

            <div class="section-title" style="border-left-color: #000; border-left-width: 4px;">Valores Comparativos</div>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; background-color: #f2f2f2; font-weight: bold;">Rubro</th>
                  <th style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right; background-color: #f2f2f2; font-weight: bold;">Sistema (O.C.)</th>
                  <th style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right; background-color: #f2f2f2; font-weight: bold;">Factura Física</th>
                  <th style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right; background-color: #f2f2f2; font-weight: bold;">Diferencia Penalizada</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;">Subtotal Costo</td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right;">C$${Number(po.total_costo).toFixed(2)}</td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right;">C$${Number(debitNote.factura_subtotal).toFixed(2)}</td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right; font-weight:bold;">C$${Number(debitNote.subtotal_diferencia).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;">Impuesto (IVA 15%)</td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right;">C$${Number(po.iva).toFixed(2)}</td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right;">C$${Number(debitNote.factura_iva).toFixed(2)}</td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right; font-weight:bold;">C$${Number(debitNote.iva_diferencia).toFixed(2)}</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;"><strong>Total (IVA Inc.)</strong></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right;"><strong>C$${Number(po.total_con_iva).toFixed(2)}</strong></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right;"><strong>C$${Number(debitNote.factura_total).toFixed(2)}</strong></td>
                  <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px; text-align:right; font-weight:bold; color: #000;"><strong>C$${Number(debitNote.monto_diferencia).toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>

            <div class="section-title" style="border-left-color: #000; border-left-width: 4px;">Detalle de la Discrepancia</div>
            <div style="background-color: #f9f9f9; border: 1px solid #ddd; padding: 12px; border-radius: 6px; font-size: 11px; margin-top: 15px; line-height: 1.5; border-left: 4px solid #000;">
              ${debitNote.descripcion}
            </div>

            <div class="signature-block">
              <div class="signature-line">Firma Administrador</div>
              <div class="signature-line">Firma Autorizada Proveedor</div>
            </div>
          </div>
        `;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              color: #333;
              padding: 20px;
              line-height: 1.4;
            }
            .header {
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              color: #000;
              text-transform: uppercase;
            }
            .meta-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
              font-size: 12px;
            }
            .section-title {
              font-size: 14px;
              font-weight: bold;
              background-color: #f2f2f2;
              padding: 6px 10px;
              margin-top: 20px;
              margin-bottom: 10px;
              border-left: 4px solid #000;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              font-size: 12px;
            }
            th {
              background-color: #f2f2f2;
              color: #000;
              font-weight: bold;
              padding: 8px;
              border: 1px solid #ddd;
            }
            td {
              padding: 8px;
              border: 1px solid #ddd;
            }
            .total-table {
              width: 40%;
              margin-left: auto;
              margin-top: 10px;
            }
            .total-table td {
              border: none;
              padding: 4px 8px;
            }
            .total-row {
              font-weight: bold;
              font-size: 14px;
              background-color: #f2f2f2;
            }
            .signature-block {
              display: flex;
              justify-content: space-between;
              margin-top: 50px;
              font-size: 12px;
            }
            .signature-line {
              width: 40%;
              border-top: 1px solid #333;
              text-align: center;
              padding-top: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${titleReport}</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">${subtitleReport}</p>
          </div>
          <div class="meta-info">
            <div>
              <strong>${idLabel}:</strong> #${po.id}<br>
              <strong>Proveedor:</strong> ${po.proveedor_nombre}<br>
              <strong>Estado:</strong> ${po.estado.toUpperCase()}<br>
              ${isApplied ? `<strong>Factura Proveedor:</strong> ${debitNote ? debitNote.factura_proveedor : 'Registrada (Completa)'}<br>` : ''}
            </div>
            <div>
              <strong>Fecha Creación:</strong> ${new Date(po.fecha_creacion).toLocaleString('es-ES')}<br>
              <strong>Emitido por:</strong> ${user.nombre}<br>
            </div>
          </div>

          <div class="section-title">${isApplied ? 'Licores / Productos Ingresados' : 'Licores / Productos Solicitados'}</div>
          <table>
            <thead>
              <tr>
                <th style="width: 8%; text-align:center;">Item</th>
                <th>Descripción del Producto</th>
                <th style="width: 15%; text-align:center;">${isApplied ? 'Cant. Recibida' : 'Cantidad'}</th>
                <th style="width: 20%; text-align:right;">Costo Unitario</th>
                <th style="width: 20%; text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          ${isApplied ? `
          <table class="total-table">
            <tr class="total-row" style="background-color:#f2f2f2; font-weight: bold; border-bottom: 1px solid #ddd;">
              <td>Total Factura:</td>
              <td style="text-align:right;color:#000;">C$${totalFact.toFixed(2)}</td>
            </tr>
            <tr class="total-row" style="background-color:#f2f2f2; font-weight: bold;">
              <td>Total Entrada:</td>
              <td style="text-align:right;color:#000;">C$${totalEntradaVal.toFixed(2)}</td>
            </tr>
          </table>
          ` : `
          <table class="total-table">
            <tr>
              <td>Subtotal Costo:</td>
              <td style="text-align:right;">C$${Number(po.total_costo).toFixed(2)}</td>
            </tr>
            <tr>
              <td>Impuesto (IVA 15%):</td>
              <td style="text-align:right;">C$${Number(po.iva).toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Total con IVA:</td>
              <td style="text-align:right; color: #000;">C$${Number(po.total_con_iva).toFixed(2)}</td>
            </tr>
          </table>
          `}

          <div class="signature-block">
            <div class="signature-line">Firma Administrador</div>
            <div class="signature-line">Firma Autorizada Proveedor</div>
          </div>

          ${debitNoteHtml}
        </body>
        </html>
      `;

      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      setLoading(false);
      console.log('Error al imprimir orden de compra:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handleExportPurchaseOrderCSV = async (poId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/purchase-orders/${poId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoading(false);
      if (!response.ok) {
        Alert.alert('Error', resData.mensaje || 'No se pudo obtener detalles de la orden de compra.');
        return;
      }

      const po = resData.header;
      const items = resData.items;

      const headers = ['Campo / Producto', 'Cantidad / Detalle', 'Costo Unitario', 'Subtotal'];
      const rows = [
        ['Orden de Compra ID', po.id, '', ''],
        ['Proveedor', po.proveedor_nombre, '', ''],
        ['Estado', po.estado.toUpperCase(), '', ''],
        ['Fecha Creación', new Date(po.fecha_creacion).toLocaleString('es-ES'), '', ''],
        ['', '', '', ''],
        ['Productos Solicitados', '', '', ''],
        ...items.map(item => [
          item.producto_nombre,
          item.cantidad_ordenada,
          Number(item.costo_unitario).toFixed(2),
          (item.cantidad_ordenada * item.costo_unitario).toFixed(2)
        ]),
        ['', '', '', ''],
        ['Subtotal Costo', Number(po.total_costo).toFixed(2), '', ''],
        ['Impuesto (IVA 15%)', Number(po.iva).toFixed(2), '', ''],
        ['Total (IVA Inc.)', Number(po.total_con_iva).toFixed(2), '', '']
      ];

      handleExportCSV(`Orden de Compra #${po.id}`, headers, rows, `orden_compra_${po.id}`);
    } catch (error) {
      setLoading(false);
      console.log('Error al exportar orden de compra a Excel:', error);
      Alert.alert('Error', 'No se pudo exportar la orden de compra.');
    }
  };

  const handlePrintDebitNote = async (ndId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/debit-notes/${ndId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const nd = await response.json();
      setLoading(false);
      if (!response.ok) {
        Alert.alert('Error', nd.mensaje || 'No se pudo obtener detalles de la nota de débito.');
        return;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Nota de Débito - Licorería</title>
          <style>
            @page { size: letter; margin: 15mm; }
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.4; padding: 10px; }
            .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
            .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
            .header p { font-size: 11px; margin: 5px 0 0 0; color: #000; }
            .meta-info { font-size: 11px; margin-bottom: 20px; display: flex; justify-content: space-between; }
            .section-title { font-size: 12px; font-weight: bold; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; font-size: 11px; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .desc-box { background-color: #f9f9f9; border: 1px solid #ddd; padding: 12px; border-radius: 6px; font-size: 11px; margin-top: 15px; line-height: 1.5; }
            .signature-block { margin-top: 60px; display: flex; justify-content: space-between; }
            .signature-line { width: 220px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>NOTA DE DÉBITO A PROVEEDOR</h1>
            <p>Licorería | Módulo de Auditoría de Compras</p>
          </div>
          <div class="meta-info">
            <div>
              <strong>Nota de Débito ID:</strong> #${nd.id}<br>
              <strong>Proveedor:</strong> ${nd.proveedor_nombre}<br>
              <strong>O.C. Asociada:</strong> #${nd.orden_compra_id} (Fecha: ${formatNicaraguaDate(nd.orden_compra_fecha)})<br>
              <strong>Factura Proveedor:</strong> ${nd.factura_proveedor}
            </div>
            <div>
              <strong>Fecha Emisión:</strong> ${new Date(nd.fecha_creacion).toLocaleString('es-NI', { timeZone: 'America/Managua' })}<br>
              <strong>Emitido por:</strong> ${user.nombre}<br>
              <strong>Tipo Discrepancia:</strong> ${nd.tipo.toUpperCase()}
            </div>
          </div>

          <div class="section-title">Valores Comparativos</div>
          <table>
            <thead>
              <tr>
                <th>Rubro</th>
                <th style="text-align:right;">Sistema (O.C.)</th>
                <th style="text-align:right;">Factura Física</th>
                <th style="text-align:right;">Diferencia Penalizada</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Subtotal Costo</td>
                <td style="text-align:right;">C$${Number(nd.orden_compra_subtotal).toFixed(2)}</td>
                <td style="text-align:right;">C$${Number(nd.factura_subtotal).toFixed(2)}</td>
                <td style="text-align:right; font-weight:bold;">C$${Number(nd.subtotal_diferencia).toFixed(2)}</td>
              </tr>
              <tr>
                <td>Impuesto (IVA 15%)</td>
                <td style="text-align:right;">C$${Number(nd.orden_compra_iva).toFixed(2)}</td>
                <td style="text-align:right;">C$${Number(nd.factura_iva).toFixed(2)}</td>
                <td style="text-align:right; font-weight:bold;">C$${Number(nd.iva_diferencia).toFixed(2)}</td>
              </tr>
              <tr style="background-color: #f2f2f2;">
                <td><strong>Total (IVA Inc.)</strong></td>
                <td style="text-align:right;"><strong>C$${Number(nd.orden_compra_total).toFixed(2)}</strong></td>
                <td style="text-align:right;"><strong>C$${Number(nd.factura_total).toFixed(2)}</strong></td>
                <td style="text-align:right; font-weight:bold; color: #000;"><strong>C$${Number(nd.monto_diferencia).toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>

          <div class="section-title">Detalle de la Discrepancia</div>
          <div class="desc-box">
            ${nd.descripcion}
          </div>

          <div class="signature-block">
            <div class="signature-line">Firma Administrador</div>
            <div class="signature-line">Firma Autorizada Proveedor</div>
          </div>
        </body>
        </html>
      `;

      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      setLoading(false);
      console.log('Error al imprimir nota de débito:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handleExportDebitNoteCSV = async (ndId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/debit-notes/${ndId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const nd = await response.json();
      setLoading(false);
      if (!response.ok) {
        Alert.alert('Error', nd.mensaje || 'No se pudo obtener detalles de la nota de débito.');
        return;
      }

      const headers = ['Campo', 'Valor Sistema (O.C.)', 'Valor Factura Física', 'Diferencia Penalizada'];
      const rows = [
        ['Nota de Débito ID', nd.id, '', ''],
        ['Proveedor', nd.proveedor_nombre, '', ''],
        ['O.C. Referencia', nd.orden_compra_id, '', ''],
        ['Factura Proveedor', nd.factura_proveedor, '', ''],
        ['Tipo Discrepancia', nd.tipo, '', ''],
        ['Fecha Emisión', new Date(nd.fecha_creacion).toLocaleString('es-ES'), '', ''],
        ['Subtotal Costo', Number(nd.orden_compra_subtotal).toFixed(2), Number(nd.factura_subtotal).toFixed(2), Number(nd.subtotal_diferencia).toFixed(2)],
        ['Impuesto (IVA 15%)', Number(nd.orden_compra_iva).toFixed(2), Number(nd.factura_iva).toFixed(2), Number(nd.iva_diferencia).toFixed(2)],
        ['Total (IVA Inc.)', Number(nd.orden_compra_total).toFixed(2), Number(nd.factura_total).toFixed(2), Number(nd.monto_diferencia).toFixed(2)],
        ['Descripción', nd.descripcion, '', '']
      ];

      handleExportCSV(`Nota Débito #${nd.id}`, headers, rows, `nota_debito_${nd.id}`);
    } catch (error) {
      setLoading(false);
      console.log('Error al exportar nota de débito a Excel:', error);
      Alert.alert('Error', 'No se pudo exportar la nota de débito.');
    }
  };

  const handleExportCatalogExcel = () => {
    const headers = ['Ref ID', 'Producto / Licor', 'Categoría', 'Existencia (unidades)', 'Precio Unitario', 'Valor Total'];
    const rows = (inventoryMovements.catalogStatus || []).map(item => [
      item.id,
      item.nombre,
      item.categoria,
      item.stock,
      item.precio.toFixed(2),
      item.valorTotal.toFixed(2)
    ]);
    const totalAlmacen = (inventoryMovements.catalogStatus || []).reduce((acc, curr) => acc + curr.valorTotal, 0);
    rows.push(['VALOR TOTAL DE ALMACÉN', '', '', '', '', totalAlmacen.toFixed(2)]);

    handleExportCSV('Existencias Inventario', headers, rows, 'existencias_inventario');
  };

  const handleExportMovementsExcel = () => {
    const headers = ['Fecha / Hora', 'Tipo Movimiento', 'Producto ID', 'Producto / Licor', 'Cantidad (unidades)', 'Referencia', 'Responsable'];
    const rows = (inventoryMovements.movements || []).map(item => [
      new Date(item.fecha).toLocaleString('es-ES', { hour12: false }),
      item.tipo,
      item.productoId,
      item.productoNombre,
      item.cantidad,
      item.referencia,
      item.responsable
    ]);

    handleExportCSV('Historial Kardex', headers, rows, 'historial_kardex');
  };

  // --- MÓDULO DE PROVEEDORES CRUD & ASOCIACIÓN ---

  const openCreateSupplierModal = () => {
    setEditingSupplier(null);
    setFormSupNombre('');
    setFormSupTelefono('');
    setFormSupEmail('');
    setFormSupDireccion('');
    setAuthPassword('');
    setSupplierModalVisible(true);
  };

  const openEditSupplierModal = (sup) => {
    setEditingSupplier(sup);
    setFormSupNombre(sup.nombre);
    setFormSupTelefono(sup.telefono || '');
    setFormSupEmail(sup.email || '');
    setFormSupDireccion(sup.direccion || '');
    setAuthPassword('');
    setSupplierModalVisible(true);
  };

  const handleSaveSupplier = async () => {
    if (!formSupNombre.trim()) {
      Alert.alert('Datos Incompletos', 'El nombre del proveedor es obligatorio.');
      return;
    }

    if (!editingSupplier && !authPassword.trim()) {
      Alert.alert('Datos Incompletos', 'Debe ingresar su contraseña de administrador para autorizar la creación del proveedor.');
      return;
    }

    setSubmittingSupplier(true);
    const url = editingSupplier ? `${API_URL}/proveedores/${editingSupplier.id}` : `${API_URL}/proveedores`;
    const method = editingSupplier ? 'PUT' : 'POST';
    const body = {
      nombre: formSupNombre.trim(),
      telefono: formSupTelefono.trim(),
      email: formSupEmail.trim().toLowerCase(),
      direccion: formSupDireccion.trim(),
      ...(!editingSupplier && { password: authPassword.trim() })
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
      setSubmittingSupplier(false);

      if (response.ok) {
        Alert.alert('Éxito', resData.mensaje || 'Proveedor guardado correctamente.');
        setSupplierModalVisible(false);
        setAuthPassword('');
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo guardar el proveedor.');
      }
    } catch (error) {
      setSubmittingSupplier(false);
      console.log('Error al guardar proveedor:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const handleDeleteSupplier = (supplier) => {
    setDeleteSupplierTarget(supplier);
    setDeleteAdminEmail(user.email || '');
    setDeleteAdminPassword('');
    setDeleteAuthModalVisible(true);
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!deleteAdminEmail.trim() || !deleteAdminPassword.trim()) {
      Alert.alert('Datos Incompletos', 'Debe ingresar el correo y la contraseña de administrador.');
      return;
    }

    setSubmittingDeleteAuth(true);
    try {
      const response = await fetch(`${API_URL}/proveedores/${deleteSupplierTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: deleteAdminEmail.trim(),
          password: deleteAdminPassword.trim()
        })
      });

      const resData = await response.json();
      setSubmittingDeleteAuth(false);

      if (response.ok) {
        setDeleteAuthModalVisible(false);
        Alert.alert('Éxito', 'El proveedor ha sido eliminado.');
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo eliminar el proveedor.');
      }
    } catch (error) {
      setSubmittingDeleteAuth(false);
      console.log('Error al eliminar proveedor:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const handleOpenAssociate = async (supplier) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/proveedores/${supplier.id}/productos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoading(false);
      if (response.ok) {
        setAssociatingSupplier(supplier);
        setCatalogForAssociation(resData.catalog || []);
        setSelectedProductIds((resData.associated || []).map(p => p.id));
        setAssociateModalVisible(true);
      } else {
        Alert.alert('Error', 'No se pudo obtener la relación de licores.');
      }
    } catch (error) {
      setLoading(false);
      console.log('Error al abrir asociación:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };

  const handleSaveAssociation = async () => {
    if (!associatingSupplier) return;
    setSavingAssociation(true);
    try {
      const response = await fetch(`${API_URL}/proveedores/${associatingSupplier.id}/productos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ productIds: selectedProductIds })
      });
      const resData = await response.json();
      setSavingAssociation(false);
      if (response.ok) {
        Alert.alert('Éxito', 'Licores asociados correctamente.');
        setAssociateModalVisible(false);
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudieron asociar licores.');
      }
    } catch (error) {
      setSavingAssociation(false);
      console.log('Error al guardar asociaciones:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };


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
  const handleSelectSupplier = async (supplierId) => {
    const selectedSup = suppliers.find(s => s.id === supplierId);
    if (!selectedSup) return;

    setPoProveedor(selectedSup.nombre);
    setPoProveedorId(supplierId);
    setPoItems([]); // Limpiar items anteriores al cambiar de proveedor
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/proveedores/${supplierId}/productos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoading(false);
      if (response.ok) {
        setPoCatalogFiltered(resData.associated || []);
      } else {
        Alert.alert('Error', 'No se pudieron cargar los licores de este proveedor.');
      }
    } catch (error) {
      setLoading(false);
      console.log('Error al obtener licores del proveedor:', error);
      Alert.alert('Error de red', 'No se pudo conectar con el servidor.');
    }
  };

  const handleOpenPoModal = () => {
    setPoProveedor('');
    setPoProveedorId(null);
    setPoCatalogFiltered([]);
    setPoItems([]);
    setShowSupplierDropdown(false);
    setPoModalVisible(true);
  };

  const handleOpenAddItem = () => {
    if (!poProveedorId) {
      Alert.alert('Seleccione Proveedor', 'Debe seleccionar un proveedor antes de agregar licores.');
      return;
    }
    if (poCatalogFiltered.length === 0) {
      Alert.alert('Proveedor sin Licores', 'Este proveedor no tiene licores asociados en catálogo. Vaya a la pestaña "Proveedores" para asociar licores.');
      return;
    }
    setSelectedProduct(poCatalogFiltered[0]);
    setPoItemQty('1');
    setPoItemCost(poCatalogFiltered[0].precio.toString());
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
        setReceivingSubtotal(resData.header.total_costo.toString());
        setReceivingIva(resData.header.iva.toString());
        
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

    const subTotalVal = parseFloat(receivingSubtotal);
    const ivaVal = parseFloat(receivingIva);

    if (isNaN(subTotalVal) || subTotalVal < 0 || isNaN(ivaVal) || ivaVal < 0) {
      Alert.alert('Montos Inválidos', 'El subtotal y el IVA de la factura deben ser números mayores o iguales a cero.');
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
          factura_subtotal: subTotalVal,
          factura_iva: ivaVal,
          items_recibidos: itemsToSubmit
        })
      });

      const resData = await response.json();
      setSubmittingReceive(false);

      if (response.ok) {
        if (resData.notaDebitoCreada) {
          Alert.alert(
            'Recepción con Discrepancia',
            `Entrada registrada.\n\n⚠️ SE GENERÓ NOTA DE DÉBITO:\nSe detectaron diferencias en valor físico o de inventario.\nTipo: ${resData.tipoNota.toUpperCase()}\nMonto penalizado: C$${Number(resData.montoDiferencia).toFixed(2)} (IVA inc.).`
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

  // Funciones de cálculo para el sistema en recepción de mercancías
  const calcSistemaSubtotal = () => {
    return receivingItems.reduce((acc, item) => {
      const qtyStr = receivedQuantities[item.producto_id];
      const qty = parseInt(qtyStr) || 0;
      const cost = parseFloat(item.producto_costo) || 0;
      return acc + (qty * cost);
    }, 0);
  };

  const calcSistemaIva = () => {
    return receivingItems.reduce((acc, item) => {
      const qtyStr = receivedQuantities[item.producto_id];
      const qty = parseInt(qtyStr) || 0;
      const cost = parseFloat(item.producto_costo) || 0;
      const ivaPct = parseFloat(item.producto_iva_porcentaje) || 0;
      return acc + (qty * cost * (ivaPct / 100));
    }, 0);
  };

  const handleSaveParams = async () => {
    if (!paramProduct) return;

    const costVal = parseFloat(paramCosto);
    const ivaVal = parseFloat(paramIva);
    const utilVal = parseFloat(paramUtilidad);

    if (isNaN(costVal) || costVal < 0 || isNaN(ivaVal) || ivaVal < 0 || isNaN(utilVal) || utilVal < 0) {
      Alert.alert('Valores Inválidos', 'El costo, IVA y utilidad deben ser números positivos o cero.');
      return;
    }

    setSubmittingParam(true);
    try {
      const response = await fetch(`${API_URL}/productos/${paramProduct.id}/parametros`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          costo: costVal,
          iva_porcentaje: ivaVal,
          utilidad_porcentaje: utilVal
        })
      });

      const resData = await response.json();
      if (response.ok) {
        Alert.alert('Éxito', resData.mensaje || 'Parámetros guardados correctamente.');
        setParamModalVisible(false);
        setParamProduct(null);
        await fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudieron guardar los parámetros.');
      }
    } catch (error) {
      console.log('Error al guardar parámetros de producto:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    } finally {
      setSubmittingParam(false);
    }
  };

  const closeProductModal = () => {
    setProductModalVisible(false);
    setFormProdNombre('');
    setFormProdDescripcion('');
    setFormProdCategoriaId(null);
    setFormProdCosto('0');
    setFormProdIva('15');
    setFormProdUtilidad('30');
    setFormProdStock('0');
  };

  const handleSaveProduct = async () => {
    if (!formProdNombre.trim()) {
      Alert.alert('Nombre Requerido', 'Por favor ingrese el nombre del producto.');
      return;
    }
    const costVal = parseFloat(formProdCosto) || 0;
    const ivaVal = parseFloat(formProdIva) || 0;
    const utilVal = parseFloat(formProdUtilidad) || 0;
    const stockVal = parseInt(formProdStock) || 0;

    if (costVal < 0 || ivaVal < 0 || utilVal < 0 || stockVal < 0) {
      Alert.alert('Valores Inválidos', 'Los números ingresados deben ser mayores o iguales a cero.');
      return;
    }

    setSubmittingProduct(true);
    try {
      const response = await fetch(`${API_URL}/productos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: formProdNombre.trim(),
          descripcion: formProdDescripcion.trim(),
          categoria_id: formProdCategoriaId,
          costo: costVal,
          iva_porcentaje: ivaVal,
          utilidad_porcentaje: utilVal,
          stock: stockVal
        })
      });

      const resData = await response.json();
      setSubmittingProduct(false);

      if (response.ok) {
        Alert.alert('Éxito', resData.mensaje || 'Producto creado correctamente.');
        closeProductModal();
        fetchDashboardData();
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudo crear el producto.');
      }
    } catch (error) {
      setSubmittingProduct(false);
      console.log('Error al crear producto:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const fetchMovementsByDates = async () => {
    if (!mvtStartDateFilter || !mvtEndDateFilter) {
      Alert.alert('Filtro de fechas', 'Debe seleccionar un rango de fechas.');
      return;
    }
    setLoadingMvts(true);
    try {
      const startStr = mvtStartDateFilter.toISOString().split('T')[0];
      const endStr = mvtEndDateFilter.toISOString().split('T')[0];
      
      const response = await fetch(`${API_URL}/reports/inventory-movements?fecha_inicio=${startStr}&fecha_fin=${endStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setLoadingMvts(false);
      if (response.ok) {
        setMvtList(resData.movements || []);
      } else {
        Alert.alert('Error', resData.mensaje || 'No se pudieron cargar los movimientos.');
      }
    } catch (error) {
      setLoadingMvts(false);
      console.log('Error al buscar movimientos:', error);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
    }
  };

  const handlePrintFilteredMovements = async () => {
    const movementsHtml = (mvtList || []).map(item => {
      const qtySign = item.cantidad >= 0 ? '+' : '';
      return `
        <tr>
          <td>${new Date(item.fecha).toLocaleString('es-ES', { hour12: false })}</td>
          <td><strong>${item.tipo}</strong></td>
          <td>${item.productoNombre}</td>
          <td style="text-align:center;font-weight:bold;color:#000;">${qtySign}${item.cantidad} u.</td>
          <td>${item.referencia}</td>
          <td>${item.responsable}</td>
        </tr>
      `;
    }).join('');

    const startStr = mvtStartDateFilter ? mvtStartDateFilter.toLocaleDateString('es-ES') : 'N/A';
    const endStr = mvtEndDateFilter ? mvtEndDateFilter.toLocaleDateString('es-ES') : 'N/A';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Movimientos de Inventario - Filtrado</title>
        <style>
          @page { size: letter; margin: 15mm; }
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.4; padding: 10px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
          .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; }
          .header p { font-size: 11px; margin: 5px 0 0 0; color: #555; }
          .meta-info { font-size: 11px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
          th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; }
          .signature-block { margin-top: 50px; display: flex; justify-content: flex-end; }
          .signature-line { width: 250px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte de Movimientos de Inventario</h1>
          <p>Licorería | Kardex de Auditoría</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Rango de Fechas:</strong> Desde ${startStr} Hasta ${endStr}<br>
            <strong>Total Movimientos:</strong> ${mvtList.length} registros
          </div>
          <div>
            <strong>Generado por:</strong> ${user.nombre} (Administrador)<br>
            <strong>Fecha de Emisión:</strong> ${new Date().toLocaleString('es-ES')}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 20%;">Fecha</th>
              <th style="width: 12%;">Tipo</th>
              <th style="width: 28%;">Licor / Producto</th>
              <th style="width: 12%; text-align:center;">Cantidad</th>
              <th style="width: 16%;">Referencia</th>
              <th style="width: 12%;">Responsable</th>
            </tr>
          </thead>
          <tbody>
            ${movementsHtml || '<tr><td colspan="6" style="text-align:center;">No hay movimientos en este rango.</td></tr>'}
          </tbody>
        </table>
        <div class="signature-block">
          <div class="signature-line">Firma Administrador</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir movimientos:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handleExportFilteredMovements = () => {
    const headers = ['Fecha', 'Tipo', 'Licor / Producto', 'Cantidad (unidades)', 'Referencia', 'Responsable'];
    const rows = mvtList.map(item => [
      new Date(item.fecha).toLocaleString('es-ES', { hour12: false }),
      item.tipo,
      item.productoNombre,
      item.cantidad,
      item.referencia,
      item.responsable
    ]);

    handleExportCSV(
      'Movimientos de Inventario',
      headers,
      rows,
      `movimientos_inventario_filtrado`
    );
  };



  if (loading && !userModalVisible && !poModalVisible && !receiveModalVisible) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loaderLogoOuter}>
          <View style={styles.loaderLogoInner}>
            <Ionicons name="wine" size={40} color="#3b82f6" />
          </View>
        </View>
        <Text style={styles.loaderBrandText}>LICOSTOCK</Text>
        <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 20, marginBottom: 10 }} />
        <Text style={styles.loaderMessageText}>Sincronizando panel de administración...</Text>
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
  const poIva = poSubtotal * 0.15;
  const poTotal = poSubtotal + poIva;

  // Filtrado de Órdenes y Entradas de Mercadería por estado y fecha
  const filteredOcs = purchaseOrders.filter(po => {
    if (po.estado !== 'pendiente') return false;

    const poDate = new Date(po.fecha_creacion);
    poDate.setHours(0,0,0,0);
    
    if (poStartDateFilter) {
      const start = new Date(poStartDateFilter);
      start.setHours(0,0,0,0);
      if (poDate < start) return false;
    }
    if (poEndDateFilter) {
      const end = new Date(poEndDateFilter);
      end.setHours(23,59,59,999);
      if (poDate > end) return false;
    }
    return true;
  });

  const filteredEntradas = purchaseOrders.filter(po => {
    if (po.estado !== 'ingresado' && po.estado !== 'discrepancia') return false;

    const poDate = new Date(po.fecha_creacion);
    poDate.setHours(0,0,0,0);
    
    if (poStartDateFilter) {
      const start = new Date(poStartDateFilter);
      start.setHours(0,0,0,0);
      if (poDate < start) return false;
    }
    if (poEndDateFilter) {
      const end = new Date(poEndDateFilter);
      end.setHours(23,59,59,999);
      if (poDate > end) return false;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* MENÚ SIDEBAR ADMINISTRADOR */}
      <Modal
        visible={sidebarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSidebarVisible(false)}
      >
        <View style={styles.sidebarOverlay}>
          <TouchableOpacity
            style={styles.sidebarCloseArea}
            activeOpacity={1}
            onPress={() => setSidebarVisible(false)}
          />
          <View style={styles.sidebarContent}>
            <View style={styles.sidebarHeader}>
              <View style={styles.sidebarAdminInfo}>
                <View style={styles.sidebarAvatar}>
                  <Ionicons name="person-circle" size={48} color="#3b82f6" />
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.sidebarAdminName}>{user.nombre}</Text>
                  <Text style={styles.sidebarAdminRole}>Administrador</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSidebarVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sidebarItems}>
              <Text style={styles.sidebarSectionTitle}>ADMINISTRACIÓN</Text>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'inventario' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('inventario'); setSidebarVisible(false); }}
              >
                <Ionicons name="cube-outline" size={20} color={activeTab === 'inventario' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'inventario' && styles.sidebarItemTextActive]}>Kardex / Existencias</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'movimientos' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('movimientos'); setSidebarVisible(false); }}
              >
                <Ionicons name="time-outline" size={20} color={activeTab === 'movimientos' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'movimientos' && styles.sidebarItemTextActive]}>Movimientos de Inventario</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'usuarios' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('usuarios'); setSidebarVisible(false); }}
              >
                <Ionicons name="people-outline" size={20} color={activeTab === 'usuarios' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'usuarios' && styles.sidebarItemTextActive]}>Control de Usuarios</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'bodegas' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('bodegas'); setSidebarVisible(false); }}
              >
                <Ionicons name="business-outline" size={20} color={activeTab === 'bodegas' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'bodegas' && styles.sidebarItemTextActive]}>Bodegas (Mermas/Deb.)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'caja' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('caja'); setSidebarVisible(false); }}
              >
                <Ionicons name="cash-outline" size={20} color={activeTab === 'caja' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'caja' && styles.sidebarItemTextActive]}>Caja / Cierre</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'bitacora' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('bitacora'); setSidebarVisible(false); }}
              >
                <Ionicons name="document-text-outline" size={20} color={activeTab === 'bitacora' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'bitacora' && styles.sidebarItemTextActive]}>Bitácora de Eventos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, activeTab === 'respaldo' && styles.sidebarItemActive]}
                onPress={() => { setActiveTab('respaldo'); setSidebarVisible(false); }}
              >
                <Ionicons name="cloud-download-outline" size={20} color={activeTab === 'respaldo' ? '#3b82f6' : '#94a3b8'} style={{ marginRight: 12 }} />
                <Text style={[styles.sidebarItemText, activeTab === 'respaldo' && styles.sidebarItemTextActive]}>Respaldar Base Datos</Text>
              </TouchableOpacity>

              <View style={styles.sidebarDivider} />
            </ScrollView>

            <TouchableOpacity
              style={styles.sidebarLogoutButton}
              onPress={() => {
                setSidebarVisible(false);
                onLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#f87171" style={{ marginRight: 12 }} />
              <Text style={styles.sidebarLogoutText}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Progreso de Restauración */}
      <Modal
        transparent={true}
        visible={restoreLoading}
        animationType="fade"
      >
        <View style={styles.restoreModalOverlay}>
          <View style={styles.restoreModalContent}>
            <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 16 }} />
            <Text style={styles.restoreModalTitle}>Restaurando Base de Datos</Text>
            <Text style={styles.restoreModalText}>
              Por favor espere. El sistema está limpiando las tablas e importando el respaldo de LICOSTOCK...
            </Text>
            <View style={styles.progressBarWrapper}>
              <View style={[styles.progressBarFill, { width: `${restoreProgress}%` }]} />
            </View>
            <Text style={styles.restoreProgressText}>{restoreProgress}% completado</Text>
          </View>
        </View>
      </Modal>

      {/* Header (No se renderiza si estamos en las vistas de facturar o conteos) */}
      {activeTab !== 'facturar' && activeTab !== 'conteos' && (
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
      )}

      {/* Content Area */}
      {activeTab === 'facturar' ? (
        <View style={{ flex: 1 }}>
          <VendedorDashboard
            token={token}
            user={user}
            onLogout={() => setActiveTab('dashboard')}
          />
        </View>
      ) : activeTab === 'conteos' ? (
        <View style={{ flex: 1 }}>
          <ConsultorDashboard
            token={token}
            user={user}
            onLogout={() => setActiveTab('dashboard')}
          />
        </View>
      ) : (activeTab === 'dashboard' || activeTab === 'compras' || activeTab === 'inventario' || activeTab === 'usuarios' || activeTab === 'bitacora' || activeTab === 'movimientos' || activeTab === 'respaldo') ? (
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
                <Text style={styles.valueNumber}>C${Number(stats.valorInventario).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
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
                        {item.total > 0 ? `C$${Math.round(item.total)}` : ''}
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

            {/* Chart 3: Distribución de Stock por Categoría */}
            <View style={styles.chartPanel}>
              <Text style={styles.chartTitle}>Existencias por Categoría de Licores</Text>
              {data?.stockByCategory && data.stockByCategory.length > 0 ? (
                data.stockByCategory.map((item, index) => {
                  const maxStock = Math.max(...data.stockByCategory.map(c => c.total_stock), 1);
                  const pct = Math.min((item.total_stock / maxStock) * 100, 100);
                  
                  return (
                    <View key={item.categoria || index} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: '#f8fafc', fontSize: 12.5, fontWeight: '600' }}>{item.categoria}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11.5, fontWeight: '700' }}>{item.total_stock} uds</Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: '#a855f7' }]} />
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyText}>No hay existencias registradas en categorías.</Text>
              )}
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color="#3b82f6" style={{ marginRight: 8 }} />
              <Text style={styles.infoCardText}>
                La base de datos está operando en la Licorería. El conteo físico del Consultor ajusta directamente las existencias del catálogo.
              </Text>
            </View>

            {/* Sección de Rendimiento de Vendedores */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Rendimiento de Vendedores</Text>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Ventas Acumuladas por Vendedor</Text>
                <TouchableOpacity style={styles.createButton} onPress={() => setReportModalVisible(true)}>
                  <Ionicons name="document-text-outline" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.createButtonText}>Generar Reporte</Text>
                </TouchableOpacity>
              </View>

              {salesBySeller.vendedores.length === 0 ? (
                <Text style={styles.emptyText}>No hay vendedores registrados.</Text>
              ) : (
                salesBySeller.vendedores.map((item) => {
                  const totalTienda = salesBySeller.totalTienda || 1;
                  const pct = Math.min((item.totalVendido / totalTienda) * 100, 100);
                  const ticketPromedio = item.cantidadVentas > 0 ? (item.totalVendido / item.cantidadVentas) : 0;

                  return (
                    <View key={item.id} style={styles.sellerRowCard}>
                      <View style={styles.sellerRowHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sellerRowName}>{item.nombre}</Text>
                          <Text style={styles.sellerRowEmail}>{item.email}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.sellerRowTotal}>C$${item.totalVendido.toFixed(2)}</Text>
                          <Text style={styles.sellerRowSub}>{item.cantidadVentas} ventas</Text>
                        </View>
                      </View>

                      {/* Barra de progreso de participación de ventas */}
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                      </View>

                      <View style={styles.sellerRowMeta}>
                        <Text style={styles.sellerMetaLabel}>Participación: {pct.toFixed(1)}%</Text>
                        <Text style={styles.sellerMetaLabel}>Promedio: C$${ticketPromedio.toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* TAB 2: COMPRAS (ÓRDENES, ENTRADAS, NOTAS DE DÉBITO Y PROVEEDORES) */}
        {activeTab === 'compras' && (
          <View>
            <View style={styles.subTabBar}>
              <TouchableOpacity
                style={[styles.subTabButton, subTabCompras === 'ordenes' && styles.subTabButtonActive]}
                onPress={() => setSubTabCompras('ordenes')}
              >
                <Text style={[styles.subTabText, subTabCompras === 'ordenes' && styles.subTabTextActive]}>Órdenes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabButton, subTabCompras === 'entradas' && styles.subTabButtonActive]}
                onPress={() => setSubTabCompras('entradas')}
              >
                <Text style={[styles.subTabText, subTabCompras === 'entradas' && styles.subTabTextActive]}>Entradas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabButton, subTabCompras === 'proveedores' && styles.subTabButtonActive]}
                onPress={() => setSubTabCompras('proveedores')}
              >
                <Text style={[styles.subTabText, subTabCompras === 'proveedores' && styles.subTabTextActive]}>Proveedores</Text>
              </TouchableOpacity>
            </View>

            {/* Barra de Filtros de Fecha */}
            {(subTabCompras === 'ordenes' || subTabCompras === 'entradas') && (
              <View style={{
                backgroundColor: '#1e293b',
                borderColor: '#334155',
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}>
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
                  Filtrar por Rango de Fechas (Entrada de Fecha)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 2 }}>Desde:</Text>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderWidth: 1,
                        borderRadius: 6,
                        padding: 8,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        setCalendarTarget('start');
                        setCalendarVisible(true);
                      }}
                    >
                      <Text style={{ color: poStartDateFilter ? '#f8fafc' : '#64748b', fontSize: 12 }}>
                        {poStartDateFilter ? poStartDateFilter.toLocaleDateString('es-ES') : 'Seleccionar...'}
                      </Text>
                      <Ionicons name="calendar-outline" size={14} color="#60a5fa" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 2 }}>Hasta:</Text>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderWidth: 1,
                        borderRadius: 6,
                        padding: 8,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        setCalendarTarget('end');
                        setCalendarVisible(true);
                      }}
                    >
                      <Text style={{ color: poEndDateFilter ? '#f8fafc' : '#64748b', fontSize: 12 }}>
                        {poEndDateFilter ? poEndDateFilter.toLocaleDateString('es-ES') : 'Seleccionar...'}
                      </Text>
                      <Ionicons name="calendar-outline" size={14} color="#60a5fa" />
                    </TouchableOpacity>
                  </View>

                  {(poStartDateFilter || poEndDateFilter) && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderColor: 'rgba(239, 68, 68, 0.2)',
                        borderWidth: 1,
                        borderRadius: 6,
                        padding: 8,
                        marginTop: 14,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        setPoStartDateFilter(null);
                        setPoEndDateFilter(null);
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* SECCIÓN ÓRDENES DE COMPRA (PENDIENTES) */}
            {subTabCompras === 'ordenes' && (
              <View>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Órdenes de Compra Pendientes</Text>
                  <TouchableOpacity style={styles.createButton} onPress={handleOpenPoModal}>
                    <Ionicons name="add-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={styles.createButtonText}>Nueva Orden</Text>
                  </TouchableOpacity>
                </View>

                {filteredOcs.length === 0 ? (
                  <Text style={styles.emptyText}>No hay órdenes de compra pendientes para este periodo.</Text>
                ) : (
                  filteredOcs.map((item) => (
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
                            Fecha: {formatNicaraguaDate(item.fecha_creacion)}
                          </Text>
                          <Text style={styles.poCostText}>
                            Costo: C$${Number(item.total_costo).toFixed(2)} + IVA (C$${Number(item.iva).toFixed(2)})
                          </Text>
                        </View>
                        <Text style={styles.poTotalValText}>
                          C$${Number(item.total_con_iva).toFixed(2)}
                        </Text>
                      </View>
                      
                      {item.estado === 'pendiente' && (
                        <TouchableOpacity style={[styles.receiveButton, { marginBottom: 8 }]} onPress={() => handleOpenReceive(item)}>
                          <Ionicons name="enter-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.receiveButtonText}>Registrar Entrada / Dar Entrada</Text>
                        </TouchableOpacity>
                      )}

                      {/* Botones de Impresión y Exportación */}
                      <View style={{ flexDirection: 'row', marginTop: 6, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8 }}>
                        <TouchableOpacity
                          style={[styles.actionButtonEdit, { flexDirection: 'row', alignItems: 'center', marginRight: 8, height: 32, paddingVertical: 0 }]}
                          onPress={() => handlePrintPurchaseOrder(item.id)}
                        >
                          <Ionicons name="print-outline" size={14} color="#3b82f6" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '600' }}>Imprimir O.C.</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButtonEdit, { flexDirection: 'row', alignItems: 'center', borderColor: '#10b981', height: 32, paddingVertical: 0 }]}
                          onPress={() => handleExportPurchaseOrderCSV(item.id)}
                        >
                          <Ionicons name="share-social-outline" size={14} color="#10b981" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '600' }}>Exportar Excel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* SECCIÓN ENTRADAS DE MERCADERÍA (RECIBIDAS/APLICADAS) */}
            {subTabCompras === 'entradas' && (
              <View>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Entradas de Mercadería</Text>
                </View>

                {filteredEntradas.length === 0 ? (
                  <Text style={styles.emptyText}>No hay entradas de mercadería registradas para este periodo.</Text>
                ) : (
                  filteredEntradas.map((item) => (
                    <View key={item.id} style={styles.poCard}>
                      <View style={styles.poHeader}>
                        <View>
                          <Text style={[styles.poIdText, { color: '#10b981' }]}>Entrada #{item.id}</Text>
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
                            Fecha Entrada: {formatNicaraguaDate(item.fecha_creacion)}
                          </Text>
                          <Text style={styles.poCostText}>
                            Costo: C$${Number(item.total_costo).toFixed(2)} + IVA (C$${Number(item.iva).toFixed(2)})
                          </Text>
                        </View>
                        <Text style={styles.poTotalValText}>
                          C$${Number(item.total_con_iva).toFixed(2)}
                        </Text>
                      </View>

                      {/* Botones de Impresión y Exportación */}
                      <View style={{ flexDirection: 'row', marginTop: 6, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8 }}>
                        <TouchableOpacity
                          style={[styles.actionButtonEdit, { flexDirection: 'row', alignItems: 'center', marginRight: 8, height: 32, paddingVertical: 0 }]}
                          onPress={() => handlePrintPurchaseOrder(item.id)}
                        >
                          <Ionicons name="print-outline" size={14} color="#3b82f6" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '600' }}>Imprimir Entrada</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButtonEdit, { flexDirection: 'row', alignItems: 'center', borderColor: '#10b981', height: 32, paddingVertical: 0 }]}
                          onPress={() => handleExportPurchaseOrderCSV(item.id)}
                        >
                          <Ionicons name="share-social-outline" size={14} color="#10b981" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '600' }}>Exportar Excel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* SECCIÓN PROVEEDORES */}
            {subTabCompras === 'proveedores' && (
              <View>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Proveedores</Text>
                  <TouchableOpacity style={styles.createButton} onPress={openCreateSupplierModal}>
                    <Ionicons name="add-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={styles.createButtonText}>Nuevo Proveedor</Text>
                  </TouchableOpacity>
                </View>

                {suppliers.length === 0 ? (
                  <Text style={styles.emptyText}>No hay proveedores registrados.</Text>
                ) : (
                  suppliers.map((item) => (
                    <View key={item.id} style={styles.poCard}>
                      <View style={styles.poHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.poIdText, { color: '#60a5fa' }]}>{item.nombre}</Text>
                          {item.email ? <Text style={styles.poProviderText}>Email: {item.email}</Text> : null}
                          {item.telefono ? <Text style={styles.poProviderText}>Teléfono: {item.telefono}</Text> : null}
                          {item.direccion ? <Text style={styles.poProviderText}>Dirección: {item.direccion}</Text> : null}
                        </View>
                      </View>
                      
                      <View style={{ flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8, justifyContent: 'space-between' }}>
                        <TouchableOpacity
                          style={[styles.actionButtonEdit, { flexDirection: 'row', alignItems: 'center', flex: 1.2, marginRight: 8, justifyContent: 'center', height: 32, paddingVertical: 0 }]}
                          onPress={() => handleOpenAssociate(item)}
                        >
                          <Ionicons name="link-outline" size={14} color="#3b82f6" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '600' }}>Asociar Licores</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionButtonEdit, { flexDirection: 'row', alignItems: 'center', flex: 0.8, marginRight: 8, justifyContent: 'center', height: 32, paddingVertical: 0 }]}
                          onPress={() => openEditSupplierModal(item)}
                        >
                          <Ionicons name="create-outline" size={14} color="#fbbf24" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '600' }}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButtonDelete, { flexDirection: 'row', alignItems: 'center', flex: 0.8, justifyContent: 'center', height: 32, paddingVertical: 0 }]}
                          onPress={() => handleDeleteSupplier(item)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#f87171" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '600' }}>Eliminar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}
        {/* TAB KARDEX: MOVIMIENTOS E INVENTARIO */}
        {activeTab === 'inventario' && (
          <View>
            {/* Cabecera del Kardex */}
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Kardex / Existencias</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity style={styles.createButton} onPress={() => setProductModalVisible(true)}>
                  <Ionicons name="add-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.createButtonText}>Nuevo Producto</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={fetchDashboardData}>
                  <Ionicons name="refresh-outline" size={20} color="#3b82f6" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Selector de Categoría */}
            <View style={[styles.panel, { padding: 12, marginBottom: 16 }]}>
              <Text style={[styles.formLabel, { marginBottom: 8 }]}>Filtrar Inventario por Categoría:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  style={[styles.categoryFilterButton, kardexCategoryFilter === 'all' && styles.categoryFilterButtonActive]}
                  onPress={() => setKardexCategoryFilter('all')}
                >
                  <Text style={[styles.categoryFilterButtonText, kardexCategoryFilter === 'all' && styles.categoryFilterButtonTextActive]}>Todas</Text>
                </TouchableOpacity>
                {categoriesList.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryFilterButton, kardexCategoryFilter === cat.id && styles.categoryFilterButtonActive, { marginLeft: 8 }]}
                    onPress={() => setKardexCategoryFilter(cat.id)}
                  >
                    <Text style={[styles.categoryFilterButtonText, kardexCategoryFilter === cat.id && styles.categoryFilterButtonTextActive]}>{cat.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Resumen de Valorización */}
            <View style={styles.kardexSummaryRow}>
              <View style={styles.kardexSummaryCard}>
                <Ionicons name="cube-outline" size={24} color="#3b82f6" style={{ marginBottom: 4 }} />
                <Text style={styles.kardexSummaryVal}>
                  {(inventoryMovements.catalogStatus || []).filter(item => {
                    if (kardexCategoryFilter === 'all') return true;
                    const cat = categoriesList.find(c => c.id === kardexCategoryFilter);
                    return cat ? item.categoria === cat.nombre : true;
                  }).length}
                </Text>
                <Text style={styles.kardexSummaryLabel}>Licores Catalogados</Text>
              </View>

              <View style={[styles.kardexSummaryCard, { borderColor: '#10b981' }]}>
                <Ionicons name="cash-outline" size={24} color="#10b981" style={{ marginBottom: 4 }} />
                <Text style={[styles.kardexSummaryVal, { color: '#10b981' }]}>
                  C$${(inventoryMovements.catalogStatus || []).filter(item => {
                    if (kardexCategoryFilter === 'all') return true;
                    const cat = categoriesList.find(c => c.id === kardexCategoryFilter);
                    return cat ? item.categoria === cat.nombre : true;
                  }).reduce((acc, curr) => acc + curr.valorTotal, 0).toFixed(2)}
                </Text>
                <Text style={styles.kardexSummaryLabel}>Valor Almacén Filtro</Text>
              </View>
            </View>

            {/* Acciones de Auditoría y Exportación */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              <TouchableOpacity 
                style={[styles.createButton, { flex: 1, backgroundColor: '#3b82f6', justifyContent: 'center', height: 38 }]}
                onPress={() => handlePrintInventory(kardexCategoryFilter)}
              >
                <Ionicons name="print-outline" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={[styles.createButtonText, { fontSize: 11 }]}>Imp. Inventario</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.createButton, { flex: 1, backgroundColor: '#10b981', justifyContent: 'center', height: 38 }]}
                onPress={handleExportCatalogExcel}
              >
                <Ionicons name="share-social-outline" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={[styles.createButtonText, { fontSize: 11 }]}>Exp. Inventario</Text>
              </TouchableOpacity>
            </View>

            {/* Listado de Licores en Almacén */}
            {(() => {
              const filtered = (inventoryMovements.catalogStatus || []).filter(item => {
                const matchCategory = kardexCategoryFilter === 'all' || 
                  (() => {
                    const cat = categoriesList.find(c => c.id === kardexCategoryFilter);
                    return cat ? item.categoria === cat.nombre : true;
                  })();
                
                const matchSearch = !kardexSearch || 
                  item.nombre.toLowerCase().includes(kardexSearch.toLowerCase()) ||
                  item.categoria.toLowerCase().includes(kardexSearch.toLowerCase()) ||
                  item.id.toString() === kardexSearch;

                return matchCategory && matchSearch;
              });

              return (
                <View style={{ paddingBottom: 40 }}>
                  {/* Buscador de Licores */}
                  <View style={[styles.panel, { padding: 12, marginBottom: 16 }]}>
                    <Text style={[styles.formLabel, { marginBottom: 6 }]}>Buscar Licor por Nombre o ID:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 6, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 10 }}>
                      <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
                      <TextInput
                        style={{ flex: 1, height: 38, color: '#f8fafc', fontSize: 13 }}
                        value={kardexSearch}
                        onChangeText={setKardexSearch}
                        placeholder="Escribe el nombre del licor..."
                        placeholderTextColor="#64748b"
                      />
                      {kardexSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setKardexSearch('')}>
                          <Ionicons name="close-circle" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <Text style={styles.sectionTitle}>Licores en Almacén ({filtered.length})</Text>
                  {filtered.length === 0 ? (
                    <Text style={styles.emptyText}>No se encontraron licores con los filtros seleccionados.</Text>
                  ) : (
                    filtered.map((item) => (
                      <View key={item.id} style={styles.poCard}>
                        <View style={styles.poHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.poIdText, { color: '#60a5fa' }]}>{item.nombre}</Text>
                            <Text style={styles.poProviderText}>Categoría: {item.categoria} | ID: #{item.id}</Text>
                          </View>
                          <TouchableOpacity
                            style={{
                              padding: 8,
                              backgroundColor: '#1e293b',
                              borderColor: '#334155',
                              borderWidth: 1,
                              borderRadius: 6,
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                            onPress={() => {
                              setParamProduct(item);
                              setParamCosto(item.costo.toString());
                              setParamIva(item.iva_porcentaje.toString());
                              setParamUtilidad(item.utilidad_porcentaje.toString());
                              setParamModalVisible(true);
                            }}
                          >
                            <Ionicons name="settings-outline" size={18} color="#60a5fa" />
                          </TouchableOpacity>
                        </View>

                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Stock Existente:</Text>
                            <Text style={{ color: item.stock > 0 ? '#10b981' : '#ef4444', fontSize: 12, fontWeight: '700' }}>
                              {item.stock} unidades
                            </Text>
                          </View>
                          
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Valor Estimado Almacén:</Text>
                            <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>
                              C${item.valorTotal.toFixed(2)}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, backgroundColor: '#0f172a', padding: 6, borderRadius: 4, marginTop: 4 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: '#94a3b8', fontSize: 10 }}>Costo: <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>C${item.costo.toFixed(2)}</Text></Text>
                              <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>IVA: <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>{item.iva_porcentaje}%</Text> | Utilidad: <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>{item.utilidad_porcentaje}%</Text></Text>
                            </View>
                            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                              <Text style={{ color: '#94a3b8', fontSize: 9 }}>Precio Venta (Calculado)</Text>
                              <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '800', marginTop: 2 }}>
                                C${item.precio.toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })()}
          </View>
        )}

        {/* TAB MOVIMIENTOS: CONSULTA POR FECHAS */}
        {activeTab === 'movimientos' && (
          <View>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Historial de Movimientos de Inventario</Text>
            </View>

            {/* Panel de Filtro de Fechas */}
            <View style={[styles.panel, { padding: 12, marginBottom: 16 }]}>
              <Text style={[styles.formLabel, { marginBottom: 8 }]}>Seleccionar Rango de Fechas para Consulta:</Text>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 2 }}>Desde:</Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderWidth: 1,
                      borderRadius: 6,
                      padding: 8,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      setCalendarTarget('mvt_start');
                      setCalendarVisible(true);
                    }}
                  >
                    <Text style={{ color: mvtStartDateFilter ? '#f8fafc' : '#64748b', fontSize: 12 }}>
                      {mvtStartDateFilter ? mvtStartDateFilter.toLocaleDateString('es-ES') : 'Seleccionar...'}
                    </Text>
                    <Ionicons name="calendar-outline" size={14} color="#60a5fa" />
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 2 }}>Hasta:</Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderWidth: 1,
                      borderRadius: 6,
                      padding: 8,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      setCalendarTarget('mvt_end');
                      setCalendarVisible(true);
                    }}
                  >
                    <Text style={{ color: mvtEndDateFilter ? '#f8fafc' : '#64748b', fontSize: 12 }}>
                      {mvtEndDateFilter ? mvtEndDateFilter.toLocaleDateString('es-ES') : 'Seleccionar...'}
                    </Text>
                    <Ionicons name="calendar-outline" size={14} color="#60a5fa" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.createButton, { flex: 1.5, backgroundColor: '#3b82f6', justifyContent: 'center', height: 38 }]}
                  onPress={fetchMovementsByDates}
                  disabled={loadingMvts}
                >
                  {loadingMvts ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.createButtonText}>Consultar Movimientos</Text>
                    </>
                  )}
                </TouchableOpacity>

                {mvtList.length > 0 && (
                  <>
                    <TouchableOpacity 
                      style={[styles.createButton, { flex: 1, backgroundColor: '#3b82f6', justifyContent: 'center', height: 38 }]}
                      onPress={handlePrintFilteredMovements}
                    >
                      <Ionicons name="print-outline" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                      <Text style={[styles.createButtonText, { fontSize: 11 }]}>Imp. PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.createButton, { flex: 1, backgroundColor: '#10b981', justifyContent: 'center', height: 38 }]}
                      onPress={handleExportFilteredMovements}
                    >
                      <Ionicons name="share-social-outline" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                      <Text style={[styles.createButtonText, { fontSize: 11 }]}>Excel (CSV)</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {/* Listado de Resultados */}
            <Text style={styles.sectionTitle}>Línea de Tiempo de Movimientos ({mvtList.length})</Text>
            {mvtList.length === 0 ? (
              <Text style={styles.emptyText}>No hay movimientos registrados para el rango seleccionado. Pulsa "Consultar Movimientos".</Text>
            ) : (
              mvtList.map((item, idx) => {
                let badgeStyle = styles.mvtBadge_entrada;
                let badgeTextStyle = styles.mvtBadgeText_entrada;
                let qtyPrefix = '';
                let qtyStyle = styles.mvtQty_entrada;

                if (item.tipo === 'SALIDA') {
                  badgeStyle = styles.mvtBadge_salida;
                  badgeTextStyle = styles.mvtBadgeText_salida;
                  qtyPrefix = '';
                  qtyStyle = styles.mvtQty_salida;
                } else if (item.tipo === 'AJUSTE') {
                  badgeStyle = styles.mvtBadge_ajuste;
                  badgeTextStyle = styles.mvtBadgeText_ajuste;
                  qtyPrefix = item.cantidad >= 0 ? '+' : '';
                  qtyStyle = item.cantidad >= 0 ? styles.mvtQty_entrada : styles.mvtQty_salida;
                } else {
                  qtyPrefix = '+';
                }

                return (
                  <View key={idx} style={styles.mvtCard}>
                    <View style={styles.mvtHeader}>
                      <View style={[styles.mvtBadge, badgeStyle]}>
                        <Text style={[styles.mvtBadgeText, badgeTextStyle]}>
                          {item.tipo}
                        </Text>
                      </View>
                      <Text style={styles.mvtRefText}>{item.referencia}</Text>
                    </View>

                    <View style={styles.mvtBodyRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.mvtProductName}>{item.productoNombre}</Text>
                        <Text style={styles.mvtMetaText}>
                          Por: <Text style={{ color: '#cbd5e1', fontWeight: '600' }}>{item.responsable}</Text>
                        </Text>
                        <Text style={styles.mvtDateText}>
                          {new Date(item.fecha).toLocaleString('es-ES', { hour12: false })}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={[styles.mvtQtyText, qtyStyle]}>
                          {qtyPrefix}{item.cantidad} u.
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
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

        {/* TAB 5: RESPALDO Y RESTAURACIÓN */}
        {activeTab === 'respaldo' && (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Respaldo y Restauración de Base de Datos</Text>
            </View>

            <View style={styles.respaldoContainer}>
              <Text style={styles.respaldoDescription}>
                Utilice esta herramienta para realizar copias de seguridad de la base de datos completa de LICOSTOCK (incluyendo catálogos, existencias, ventas, compras y bitácoras) y restaurarlas en caso de emergencias o migración de servidor.
              </Text>

              {/* Botón Generar Respaldo */}
              <View style={styles.respaldoCard}>
                <View style={styles.respaldoIconWrapper}>
                  <Ionicons name="cloud-download" size={32} color="#3b82f6" />
                </View>
                <View style={styles.respaldoContent}>
                  <Text style={styles.respaldoCardTitle}>Generar Copia de Seguridad</Text>
                  <Text style={styles.respaldoCardText}>
                    Crea un archivo JSON descifrable con toda la información del sistema y permite compartirlo o guardarlo en la nube.
                  </Text>
                  <TouchableOpacity
                    style={[styles.respaldoButton, backupLoading && styles.disabledButton]}
                    onPress={handleBackupDatabase}
                    disabled={backupLoading || restoreLoading}
                  >
                    {backupLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="download-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.respaldoButtonText}>Exportar Respaldo</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Botón Restaurar Respaldo */}
              <View style={[styles.respaldoCard, { borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <View style={[styles.respaldoIconWrapper, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Ionicons name="cloud-upload" size={32} color="#f87171" />
                </View>
                <View style={styles.respaldoContent}>
                  <Text style={[styles.respaldoCardTitle, { color: '#f87171' }]}>Restaurar Copia de Seguridad</Text>
                  <Text style={styles.respaldoCardText}>
                    Selecciona un archivo de respaldo desde el teléfono móvil para sobrescribir toda la base de datos de producción actual.
                  </Text>
                  <TouchableOpacity
                    style={[styles.respaldoButton, styles.restoreButton, restoreLoading && styles.disabledButton]}
                    onPress={handleRestoreDatabase}
                    disabled={backupLoading || restoreLoading}
                  >
                    {restoreLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="alert-circle-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.respaldoButtonText}>Importar y Restaurar</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    ) : null}

      {/* ==================================================
          PESTAÑA: CAJA (Cierre por Admin)
      ================================================== */}
      {/* ==================================================
          PESTAÑA: CAJA (Cierre por Admin)
      ================================================== */}
      {activeTab === 'caja' && (
        <ScrollView style={styles.content}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Cierre de Caja y Arqueo (Admin)</Text>
            </View>
            {/* Formulario de cierre / Resultado de arqueo */}
            {cierreResultado ? (
              <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 16, borderWidth: 1, borderColor: '#10b981' }}>
                <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Cierre Registrado Correctamente</Text>
                <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Vendedor: {lastClosedBox?.vendedor_nombre || 'Sistema'}</Text>
                <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Total Ventas Sistema: C$${Number(cierreResultado.totalVentas).toFixed(2)}</Text>
                <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Fondo Caja: C$${Number(cierreResultado.fondo).toFixed(2)}</Text>
                <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Efectivo Esperado: C$${Number(cierreResultado.efectivoEsperado).toFixed(2)}</Text>
                <Text style={[{ fontSize: 13, fontWeight: '700', marginTop: 6 }, Number(cierreResultado.diferencia) >= 0 ? { color: '#10b981' } : { color: '#f87171' }]}>
                  Diferencia: C$${Number(cierreResultado.diferencia).toFixed(2)}
                </Text>
                
                {/* Botón para Reimprimir Ticket de Cierre */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    backgroundColor: '#3b82f6',
                    borderRadius: 6,
                    height: 40,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 16,
                  }}
                  onPress={() => {
                    if (cierreResultado && lastClosedBox && lastClosedDenominaciones) {
                      imprimirTicketCierre(cierreResultado, lastClosedBox, lastClosedDenominaciones);
                    } else {
                      Alert.alert('Aviso', 'No hay datos de cierre disponibles para imprimir.');
                    }
                  }}
                >
                  <Ionicons name="print-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Reimprimir Ticket de Cierre (80mm)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Caja del Día Status / Apertura */}
                {cajasActivas.length === 0 && (
                  <View style={{
                    backgroundColor: '#0f172a',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 20,
                    borderWidth: 1,
                    borderColor: '#ef4444'
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <Ionicons name="lock-closed-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                      <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '700' }}>Caja del Día No Abierta</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.submitButton, { backgroundColor: '#10b981', marginTop: 4 }]}
                      onPress={handleAperturaCaja}
                    >
                      <Ionicons name="log-in-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.submitButtonText}>Abrir Caja del Día</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 1. Selector de Caja Pendiente */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Seleccione Caja de Vendedor Lista para Cierre *</Text>
                  <TouchableOpacity
                    style={[styles.formInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                    onPress={() => setShowPendientesDropdown(!showPendientesDropdown)}
                  >
                    <Text style={{ color: selectedPendiente ? '#f8fafc' : '#64748b', fontSize: 13 }}>
                      {selectedPendiente 
                        ? `${selectedPendiente.vendedor_nombre} (Apertura: ${formatNicaraguaDate(selectedPendiente.fecha_caja)})` 
                        : 'Seleccionar caja pendiente...'}
                    </Text>
                    <Ionicons name={showPendientesDropdown ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color="#94a3b8" />
                  </TouchableOpacity>

                  {showPendientesDropdown && (
                    <View style={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderWidth: 1,
                      borderRadius: 6,
                      marginTop: 4,
                      maxHeight: 180,
                    }}>
                      <ScrollView nestedScrollEnabled={true}>
                        {pendientesCierre.map((p) => (
                          <TouchableOpacity
                            key={p.apertura_id}
                            style={{
                              padding: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: '#334155',
                              backgroundColor: selectedPendiente?.apertura_id === p.apertura_id ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
                            }}
                            onPress={() => {
                              setSelectedPendiente(p);
                              setShowPendientesDropdown(false);
                            }}
                          >
                            <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: selectedPendiente?.apertura_id === p.apertura_id ? '700' : '400' }}>
                              {p.vendedor_nombre} - Fecha: {formatNicaraguaDate(p.fecha_caja)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {pendientesCierre.length === 0 ? (
                  <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#334155' }}>
                    <Ionicons name="shield-outline" size={32} color="#64748b" style={{ marginBottom: 8 }} />
                    <Text style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                      No hay cajas pre-cerradas en el sistema por vendedores esperando arqueo en este momento.
                    </Text>
                  </View>
                ) : selectedPendiente ? (
                  <View>
                    {/* Resumen de ventas del vendedor seleccionado */}
                    <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#334155' }}>
                      <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Ventas del Vendedor en Sistema (Hoy)</Text>
                      {loadingCierreCaja ? (
                        <ActivityIndicator color="#3b82f6" />
                      ) : (
                        <Text style={{ color: '#10b981', fontSize: 22, fontWeight: '800' }}>C$${totalHoyAdmin.toFixed(2)}</Text>
                      )}
                      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>{ventasHoyAdmin.length} ventas completadas</Text>
                    </View>

                    {/* Fondo de Caja y Efectivo Esperado */}
                    <View style={{ backgroundColor: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#334155' }}>
                      <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Fondo de Caja (Fijo)</Text>
                      <Text style={{ color: '#f8fafc', fontSize: 16, fontWeight: '700' }}>C$1,000.00</Text>
                      <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                        Efectivo Esperado (Ventas + Fondo): C$${(totalHoyAdmin + 1000).toFixed(2)}
                      </Text>
                    </View>

                    {/* Campos de arqueo por denominaciones */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Conteo Físico por Denominaciones *</Text>
                      <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>Ingrese la cantidad de billetes o monedas encontradas:</Text>
                      
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        {[
                          { val: '1000', label: 'C$1,000 (Billete)' },
                          { val: '500', label: 'C$500 (Billete)' },
                          { val: '200', label: 'C$200 (Billete)' },
                          { val: '100', label: 'C$100 (Billete)' },
                          { val: '50', label: 'C$50 (Billete)' },
                          { val: '20', label: 'C$20 (Billete)' },
                          { val: '10', label: 'C$10 (Billete)' },
                          { val: '5', label: 'C$5 (Moneda)' },
                          { val: '1', label: 'C$1 (Moneda)' }
                        ].map((denom) => {
                          const qty = denominaciones[denom.val] || '';
                          const subtotal = parseInt(denom.val) * (parseInt(qty) || 0);
                          return (
                            <View key={denom.val} style={{
                              width: '48%',
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderWidth: 1,
                              borderRadius: 6,
                              padding: 8,
                              marginBottom: 10,
                            }}>
                              <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '600' }}>{denom.label}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                <TextInput
                                  style={{
                                    flex: 1,
                                    backgroundColor: '#1e293b',
                                    borderRadius: 4,
                                    height: 36,
                                    color: '#ffffff',
                                    paddingHorizontal: 8,
                                    fontSize: 13,
                                    textAlign: 'center',
                                    borderWidth: 1,
                                    borderColor: '#475569'
                                  }}
                                  value={qty}
                                  onChangeText={(text) => {
                                    const sanitized = text.replace(/[^0-9]/g, '');
                                    setDenominaciones(prev => ({ ...prev, [denom.val]: sanitized }));
                                  }}
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor="#475569"
                                />
                              </View>
                              <Text style={{ color: '#10b981', fontSize: 11, textAlign: 'right', marginTop: 4, fontWeight: '700' }}>
                                C$${subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    {/* Total Efectivo Físico Calculado (Read-Only) */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Total Efectivo Físico Contado (C$)</Text>
                      <View style={[styles.formInput, { justifyContent: 'center', backgroundColor: '#1e293b' }]}>
                        <Text style={{ color: '#10b981', fontSize: 16, fontWeight: '800' }}>
                          C$${Object.keys(denominaciones).reduce((acc, den) => acc + (parseInt(den) * (parseInt(denominaciones[den]) || 0)), 0).toFixed(2)}
                        </Text>
                      </View>
                      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                        Calculado automáticamente a partir del conteo por denominaciones (debe incluir el fondo de C$1,000.00).
                      </Text>
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Observaciones de Arqueo (Opcional)</Text>
                      <TextInput
                        style={[styles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                        value={cierreObservaciones}
                        onChangeText={setCierreObservaciones}
                        placeholder="Diferencias detectadas, justificación de sobrantes/faltantes..."
                        placeholderTextColor="#64748b"
                        multiline={true}
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.submitButton, { backgroundColor: '#10b981' }]}
                      onPress={handleCierreCaja}
                      disabled={submittingCierre}
                    >
                      {submittingCierre ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="lock-closed-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                          <Text style={styles.submitButtonText}>Registrar Cierre y Guardar Arqueo</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* 3. Monitoreo de Cajas Activas */}
          <View style={[styles.panel, { marginTop: 20 }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Monitoreo de Cajas Activas (Hoy)</Text>
              <TouchableOpacity onPress={fetchCajasActivas} disabled={loadingCajasActivas}>
                {loadingCajasActivas ? (
                  <ActivityIndicator color="#3b82f6" size="small" />
                ) : (
                  <Ionicons name="refresh-outline" size={20} color="#3b82f6" />
                )}
              </TouchableOpacity>
            </View>

            {cajasActivas.length === 0 ? (
              <View style={{ padding: 12, alignItems: 'center' }}>
                <Text style={{ color: '#64748b', fontSize: 13 }}>No hay cajas activas registradas el día de hoy.</Text>
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                {cajasActivas.map((caja) => (
                  <View key={caja.apertura_id} style={{
                    backgroundColor: '#0f172a',
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: '#334155'
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#f8fafc', fontWeight: '700', fontSize: 13 }}>{caja.vendedor_nombre}</Text>
                      <View style={{
                        backgroundColor: caja.estado === 'por_cerrar' || caja.estado === 'listo_para_cierre' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: caja.estado === 'por_cerrar' || caja.estado === 'listo_para_cierre' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'
                      }}>
                        <Text style={{
                          color: caja.estado === 'por_cerrar' || caja.estado === 'listo_para_cierre' ? '#fbbf24' : '#10b981',
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase'
                        }}>
                          {caja.estado === 'por_cerrar' || caja.estado === 'listo_para_cierre' ? 'Por Cerrar' : 'Abierta'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ color: '#64748b', fontSize: 11 }}>Ventas hoy: ({caja.total_ventas_count} facturas)</Text>
                        <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '700', marginTop: 2 }}>C$${caja.total_ventas.toFixed(2)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'right' }}>Efectivo esperado (Ventas + Fondo):</Text>
                        <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '600', marginTop: 2, textAlign: 'right' }}>C$${caja.esperado.toFixed(2)}</Text>
                      </View>
                    </View>
                    <Text style={{ color: '#475569', fontSize: 10, marginTop: 8 }}>Apertura: {new Date(caja.fecha_creacion).toLocaleString('es-ES', { timeZone: 'America/Managua' })}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          {/* 4. Historial de Cajas Cerradas */}
          <View style={[styles.panel, { marginTop: 20 }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Historial de Cajas</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => {
                  if (historialCajasAdmin.length === 0) fetchHistorialCajasAdmin();
                  else setHistorialCajasAdmin([]);
                }}
              >
                <Ionicons name={historialCajasAdmin.length > 0 ? 'chevron-up' : 'time-outline'} size={18} color="#3b82f6" />
                <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '600' }}>
                  {historialCajasAdmin.length > 0 ? 'Ocultar' : 'Ver Historial'}
                </Text>
              </TouchableOpacity>
            </View>

            {loadingHistorialAdmin ? (
              <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
            ) : historialCajasAdmin.length > 0 ? (
              historialCajasAdmin.map((caja) => {
                const diferencia = Number(caja.diferencia);
                const diferenciaColor = diferencia < 0 ? '#f87171' : diferencia > 0 ? '#fbbf24' : '#10b981';
                return (
                  <TouchableOpacity
                    key={caja.id}
                    style={[styles.logCard, { marginBottom: 10, flexDirection: 'column' }]}
                    onPress={() => fetchVentasSesionAdmin(caja.id)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.logAction, { fontSize: 13 }]}>
                          {new Date(caja.fecha_caja + 'T00:00:00').toLocaleDateString('es-NI', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </Text>
                        <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Vendedor: {caja.vendedor_nombre}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '800' }}>C${Number(caja.total_ventas_sistema).toFixed(2)}</Text>
                        <Text style={{ color: diferenciaColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                          Dif: {diferencia >= 0 ? '+' : ''}C${diferencia.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <Text style={{ color: '#475569', fontSize: 11 }}>
                        Arqueo: C${Number(caja.efectivo_declarado).toFixed(2)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="list-outline" size={13} color="#3b82f6" />
                        <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '700' }}>Ver facturas</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : historialCajasAdmin.length === 0 && !loadingHistorialAdmin ? (
              <Text style={{ color: '#475569', fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 }}>
                Presione "Ver Historial" para cargar las sesiones cerradas.
              </Text>
            ) : null}
          </View>

          <View style={{ height: 70 }} />
        </ScrollView>
      )}

      {/* ==================================================
          PESTAÑA: BODEGAS (Gestion Admin)
      ================================================== */}
      {activeTab === 'bodegas' && (
        <View style={{ flex: 1 }}>
          <View style={styles.subTabBar}>
            <TouchableOpacity
              style={[styles.subTabButton, subTabBodegas === 'resumen' && styles.subTabButtonActive]}
              onPress={() => setSubTabBodegas('resumen')}
            >
              <Text style={[styles.subTabText, subTabBodegas === 'resumen' && styles.subTabTextActive]}>Resumen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTabButton, subTabBodegas === 'transferir' && styles.subTabButtonActive]}
              onPress={() => setSubTabBodegas('transferir')}
            >
              <Text style={[styles.subTabText, subTabBodegas === 'transferir' && styles.subTabTextActive]}>Transferir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTabButton, subTabBodegas === 'movimientos' && styles.subTabButtonActive]}
              onPress={() => { setSubTabBodegas('movimientos'); fetchMovimientosBodega(); }}
            >
              <Text style={[styles.subTabText, subTabBodegas === 'movimientos' && styles.subTabTextActive]}>Historial</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* SUB-TAB: RESUMEN DE BODEGAS */}
            {subTabBodegas === 'resumen' && (
              <View>
                {loadingBodegas ? (
                  <ActivityIndicator color="#3b82f6" style={{ marginVertical: 30 }} />
                ) : bodegas.length === 0 ? (
                  <Text style={styles.emptyText}>No se encontraron bodegas.</Text>
                ) : (
                  bodegas.map(b => (
                    <View key={b.id} style={[styles.panel, { marginBottom: 12 }]}>
                      <View style={styles.panelHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.panelTitle}>{b.nombre}</Text>
                          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{b.descripcion || b.tipo}</Text>
                        </View>
                        <TouchableOpacity
                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)' }}
                          onPress={() => fetchBodegaStock(b.tipo)}
                        >
                          <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '700' }}>Ver Stock</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ color: '#f8fafc', fontSize: 20, fontWeight: '800' }}>{b.totalUnidades}</Text>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>Unidades</Text>
                        </View>
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ color: '#f8fafc', fontSize: 20, fontWeight: '800' }}>{b.totalProductos}</Text>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>Productos</Text>
                        </View>
                        <View style={{ alignItems: 'center', flex: 1 }}>
                          <View style={[
                            { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
                            b.tipo === 'principal' ? { backgroundColor: 'rgba(16,185,129,0.15)' } :
                            b.tipo === 'merma' ? { backgroundColor: 'rgba(239,68,68,0.15)' } :
                            { backgroundColor: 'rgba(245,158,11,0.15)' }
                          ]}>
                            <Text style={[
                              { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
                              b.tipo === 'principal' ? { color: '#10b981' } :
                              b.tipo === 'merma' ? { color: '#f87171' } :
                              { color: '#f59e0b' }
                            ]}>{b.tipo}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#334155' }}
                  onPress={fetchBodegas}
                >
                  <Ionicons name="refresh-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: '600' }}>Actualizar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SUB-TAB: TRANSFERIR */}
            {subTabBodegas === 'transferir' && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Transferencia entre Bodegas</Text>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Bodega Origen</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['principal', 'merma', 'debito'].map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.subTabButton, transferOrigen === t && styles.subTabButtonActive, { flex: 1 }]}
                        onPress={() => { setTransferOrigen(t); setTransferProductoId(null); setTransferProductoNombre(''); }}
                      >
                        <Text style={[styles.subTabText, transferOrigen === t && styles.subTabTextActive, { textTransform: 'capitalize' }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Indicador de carga de stock */}
                  {loadingStockOrigen ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <ActivityIndicator size="small" color="#3b82f6" />
                      <Text style={{ color: '#64748b', fontSize: 11 }}>Cargando existencias...</Text>
                    </View>
                  ) : (
                    <Text style={{ color: '#475569', fontSize: 11, marginTop: 5 }}>
                      {Object.keys(stockOrigenMap).length} producto(s) con stock en bodega {transferOrigen}
                    </Text>
                  )}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Bodega Destino</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['principal', 'merma', 'debito'].map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.subTabButton, transferDestino === t && styles.subTabButtonActive, { flex: 1 }]}
                        onPress={() => setTransferDestino(t)}
                      >
                        <Text style={[styles.subTabText, transferDestino === t && styles.subTabTextActive, { textTransform: 'capitalize' }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Motivo General (Opcional)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={transferMotivo}
                    onChangeText={setTransferMotivo}
                    placeholder="Ej. Traspaso de mercadería dañada"
                    placeholderTextColor="#64748b"
                  />
                </View>

                <View style={[styles.formGroup, { borderTopWidth: 1, borderColor: '#1e293b', paddingTop: 15 }]}>
                  <Text style={styles.formLabel}>Buscar Producto</Text>
                  <TextInput
                    style={styles.formInput}
                    value={transferProductSearch}
                    onChangeText={setTransferProductSearch}
                    placeholder="Escriba para filtrar licores..."
                    placeholderTextColor="#64748b"
                  />
                </View>

                {/* Lista filtrada de catálogo con existencias de la bodega origen */}
                {poCatalog.length > 0 && (
                  <View style={{ maxHeight: 180, marginBottom: 12, borderWidth: 1, borderColor: '#334155', borderRadius: 6, overflow: 'hidden' }}>
                    <ScrollView nestedScrollEnabled={true}>
                      {poCatalog
                        .filter(item => item.nombre.toLowerCase().includes(transferProductSearch.toLowerCase()))
                        .map((item) => {
                          const stockDisp = stockOrigenMap[item.id] ?? 0;
                          const sinStock = stockDisp === 0;
                          return (
                            <TouchableOpacity
                              key={item.id.toString()}
                              style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#1e293b' }, transferProductoId === item.id && { backgroundColor: 'rgba(59,130,246,0.1)' }]}
                              onPress={() => { setTransferProductoId(item.id); setTransferProductoNombre(item.nombre); }}
                            >
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={{ color: sinStock ? '#475569' : '#f8fafc', fontSize: 13 }}>{item.nombre}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                {/* Badge de stock */}
                                <View style={{ backgroundColor: sinStock ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                  <Text style={{ color: sinStock ? '#f87171' : '#10b981', fontSize: 11, fontWeight: '700' }}>
                                    {sinStock ? 'Sin stock' : `${stockDisp} u.`}
                                  </Text>
                                </View>
                                <Ionicons name={transferProductoId === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={transferProductoId === item.id ? '#3b82f6' : '#64748b'} />
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>
                )}

                {transferProductoId && (() => {
                  const stockDisp = stockOrigenMap[transferProductoId] ?? 0;
                  const sinStock = stockDisp === 0;
                  return (
                    <View style={{ backgroundColor: 'rgba(59,130,246,0.07)', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: sinStock ? '#7f1d1d50' : '#1d4ed850' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2 }}>Licor Seleccionado:</Text>
                          <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: 'bold' }}>{transferProductoNombre}</Text>
                        </View>
                        <View style={{ backgroundColor: sinStock ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignItems: 'center', minWidth: 70 }}>
                          <Text style={{ color: sinStock ? '#f87171' : '#10b981', fontSize: 18, fontWeight: '900' }}>{stockDisp}</Text>
                          <Text style={{ color: sinStock ? '#f87171' : '#6ee7b7', fontSize: 10, fontWeight: '600' }}>disponible{stockDisp !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                      {sinStock && (
                        <Text style={{ color: '#f87171', fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>
                          ⚠ Este producto no tiene stock en la bodega {transferOrigen}.
                        </Text>
                      )}
                    </View>
                  );
                })()}

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Cantidad a Añadir</Text>
                  <TextInput
                    style={styles.formInput}
                    value={transferCantidad}
                    onChangeText={setTransferCantidad}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#64748b"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: '#10b981', marginBottom: 15 }]}
                  onPress={handleAddProductToTransfer}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitButtonText}>Agregar al Traslado</Text>
                </TouchableOpacity>

                {/* Resumen del borrador de traslado */}
                <View style={{ borderTopWidth: 1, borderColor: '#1e293b', paddingTop: 15, marginTop: 10 }}>
                  <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600', marginBottom: 10 }}>
                    Borrador de Traslado ({transferCart.length} producto{transferCart.length !== 1 ? 's' : ''})
                  </Text>

                  {transferCart.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        style={[styles.submitButton, { flex: 1 }]}
                        onPress={() => setTransferCartModalVisible(true)}
                      >
                        <Ionicons name="eye-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={styles.submitButtonText}>Ver y Confirmar Traslado</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: '#dc2626', width: 50, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}
                        onPress={() => {
                          Alert.alert('Confirmación', '¿Desea limpiar el borrador del traslado?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Limpiar', style: 'destructive', onPress: () => setTransferCart([]) }
                          ]);
                        }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginVertical: 8 }}>
                      No se han agregado productos a la lista de traslado.
                    </Text>
                  )}

                  {lastTransferResult && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#3b82f6', borderRadius: 6, marginTop: 12 }}
                      onPress={() => imprimirReporteTraslado(lastTransferResult)}
                    >
                      <Ionicons name="print-outline" size={18} color="#3b82f6" style={{ marginRight: 8 }} />
                      <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: '600' }}>Reimprimir Último Traslado</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* SUB-TAB: HISTORIAL MOVIMIENTOS */}
            {subTabBodegas === 'movimientos' && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Historial de Movimientos de Bodega</Text>
                {loadingMovimientos ? (
                  <ActivityIndicator color="#3b82f6" style={{ marginVertical: 20 }} />
                ) : movimientosBodega.length === 0 ? (
                  <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
                ) : (() => {
                  // Agrupar movimientos por codigo_traslado
                  const grupos = {};
                  const orden = [];
                  movimientosBodega.forEach(m => {
                    const key = m.codigo_traslado || `single_${m.id}`;
                    if (!grupos[key]) {
                      grupos[key] = [];
                      orden.push(key);
                    }
                    grupos[key].push(m);
                  });

                  return orden.map(key => {
                    const items = grupos[key];
                    const primero = items[0];
                    const esTraslado = items.length > 1 && primero.codigo_traslado;
                    const totalUnidades = items.reduce((acc, it) => acc + Number(it.cantidad), 0);

                    if (esTraslado) {
                      // Tarjeta agrupada para traslados multi-producto
                      return (
                        <View key={key} style={[styles.logCard, { marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#3b82f6' }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="swap-horizontal" size={16} color="#3b82f6" />
                              <Text style={[styles.logAction, { fontSize: 13, color: '#3b82f6' }]}>Traslado Grupal</Text>
                            </View>
                            <View style={{ backgroundColor: '#3b82f620', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                              <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '700' }}>{items.length} productos · {totalUnidades} u.</Text>
                            </View>
                          </View>
                          <Text style={styles.logDescription}>
                            {primero.bodega_origen} → {primero.bodega_destino}
                          </Text>
                          {primero.motivo ? <Text style={[styles.logDescription, { fontStyle: 'italic' }]}>Motivo: {primero.motivo}</Text> : null}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                            <View>
                              <Text style={styles.logUser}>Por: {primero.usuario || 'Sistema'}</Text>
                              <Text style={styles.logDate}>{formatNicaraguaDate(primero.fecha)}</Text>
                            </View>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1d4ed820', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f650' }}
                              onPress={() => { setSelectedTraslado({ codigo: key, items, primero }); setTrasladoDetailModalVisible(true); }}
                            >
                              <Ionicons name="document-text-outline" size={14} color="#3b82f6" />
                              <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '700' }}>Ver Traslado</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    } else {
                      // Tarjeta individual
                      const m = primero;
                      return (
                        <View key={key} style={[styles.logCard, { marginBottom: 10 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={[styles.logAction, { fontSize: 13 }]}>{m.producto_nombre}</Text>
                            <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '700' }}>{m.cantidad} u.</Text>
                          </View>
                          <Text style={styles.logDescription}>
                            {m.bodega_origen} ({m.tipo_origen}) → {m.bodega_destino} ({m.tipo_destino})
                          </Text>
                          {m.motivo ? <Text style={styles.logDescription}>Motivo: {m.motivo}</Text> : null}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                            <Text style={styles.logUser}>Por: {m.usuario || 'Sistema'}</Text>
                            <Text style={styles.logDate}>{formatNicaraguaDate(m.fecha)}</Text>
                          </View>
                          {m.codigo_traslado && (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-end', backgroundColor: '#1d4ed820', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f650' }}
                              onPress={() => { setSelectedTraslado({ codigo: key, items, primero: m }); setTrasladoDetailModalVisible(true); }}
                            >
                              <Ionicons name="document-text-outline" size={14} color="#3b82f6" />
                              <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '700' }}>Ver Traslado</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    }
                  });
                })()}
              </View>
            )}
            <View style={{ height: 70 }} />
          </ScrollView>
        </View>
      )}

      {/* MODAL DETALLE SESIÓN DE CAJA (ADMIN) */}
      <Modal
        visible={sesionAdminVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSesionAdminVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt" size={18} color="#3b82f6" />
                <Text style={styles.modalTitle}>Detalle de Sesión</Text>
              </View>
              <TouchableOpacity onPress={() => setSesionAdminVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            {loadingSesionAdmin ? (
              <ActivityIndicator color="#3b82f6" style={{ marginVertical: 30 }} />
            ) : selectedSesionAdmin ? (() => {
              const { caja, ventas: ventasSesion } = selectedSesionAdmin;
              const diferencia = Number(caja.diferencia);
              const diferenciaColor = diferencia < 0 ? '#f87171' : diferencia > 0 ? '#fbbf24' : '#10b981';
              const totalSesion = ventasSesion.reduce((acc, v) => acc + Number(v.total), 0);
              return (
                <>
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
                          <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: '600' }}>Factura #{v.id}</Text>
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
                            <Ionicons name="print-outline" size={12} color="#3b82f6" />
                            <Text style={{ color: '#3b82f6', fontSize: 10, fontWeight: '700' }}>Reimprimir</Text>
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

      {/* MODAL BORRADOR DE TRASLADO */}
      <Modal
        visible={transferCartModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTransferCartModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Borrador de Traslado</Text>
              <TouchableOpacity onPress={() => setTransferCartModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#1e293b' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 }}>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>Origen:</Text>
                <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' }}>{transferOrigen}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 }}>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>Destino:</Text>
                <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' }}>{transferDestino}</Text>
              </View>
              {transferMotivo ? (
                <View style={{ marginTop: 5 }}>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>Motivo:</Text>
                  <Text style={{ color: '#f8fafc', fontSize: 12, fontStyle: 'italic' }}>{transferMotivo}</Text>
                </View>
              ) : null}
            </View>

            {transferCart.length === 0 ? (
              <Text style={styles.emptyText}>No hay productos seleccionados.</Text>
            ) : (
              <FlatList
                data={transferCart}
                keyExtractor={i => i.producto_id.toString()}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#1e293b' }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: '600' }}>{item.nombre}</Text>
                      <Text style={{ color: '#64748b', fontSize: 11 }}>Ref ID: #{item.producto_id}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                      <Text style={{ color: '#3b82f6', fontSize: 14, fontWeight: '700' }}>{item.cantidad} u.</Text>
                      <TouchableOpacity onPress={() => handleRemoveProductFromTransfer(item.producto_id)}>
                        <Ionicons name="trash-outline" size={18} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={{ marginTop: 20 }}>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleTransferirBodega}
                disabled={submittingTransfer || transferCart.length === 0}
              >
                {submittingTransfer ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Confirmar y Transferir</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL VER TRASLADO */}
      <Modal
        visible={trasladoDetailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTrasladoDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="swap-horizontal" size={20} color="#3b82f6" />
                <Text style={styles.modalTitle}>Detalle del Traslado</Text>
              </View>
              <TouchableOpacity onPress={() => setTrasladoDetailModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            {selectedTraslado && (
              <>
                {/* Info general del traslado */}
                <View style={{ backgroundColor: '#0f172a', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Código de Traslado</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{selectedTraslado.codigo}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Bodega Origen</Text>
                    <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>{selectedTraslado.primero.bodega_origen}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Bodega Destino</Text>
                    <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>{selectedTraslado.primero.bodega_destino}</Text>
                  </View>
                  {selectedTraslado.primero.motivo ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Motivo</Text>
                      <Text style={{ color: '#e2e8f0', fontSize: 12, fontStyle: 'italic', maxWidth: '60%', textAlign: 'right' }}>{selectedTraslado.primero.motivo}</Text>
                    </View>
                  ) : null}
                  <View style={{ height: 1, backgroundColor: '#1e293b', marginVertical: 8 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Aplicado por</Text>
                    <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '700' }}>{selectedTraslado.primero.usuario || 'Sistema'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Fecha y Hora</Text>
                    <Text style={{ color: '#e2e8f0', fontSize: 12 }}>{formatNicaraguaDate(selectedTraslado.primero.fecha)}</Text>
                  </View>
                </View>

                {/* Lista de artículos */}
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Artículos Trasladados ({selectedTraslado.items.length})
                </Text>
                <FlatList
                  data={selectedTraslado.items}
                  keyExtractor={it => it.id.toString()}
                  style={{ maxHeight: 280 }}
                  renderItem={({ item, index }) => (
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 4,
                      borderBottomWidth: 1,
                      borderColor: '#1e293b'
                    }}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: '600' }}>{item.producto_nombre}</Text>
                        <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>#{index + 1} · Ref ID {item.producto_id}</Text>
                      </View>
                      <View style={{ backgroundColor: '#10b98120', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '800' }}>{item.cantidad} u.</Text>
                      </View>
                    </View>
                  )}
                  ListFooterComponent={
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700' }}>Total Unidades</Text>
                      <Text style={{ color: '#3b82f6', fontSize: 14, fontWeight: '800' }}>
                        {selectedTraslado.items.reduce((acc, it) => acc + Number(it.cantidad), 0)} u.
                      </Text>
                    </View>
                  }
                />

                {/* Botón imprimir desde el modal */}
                <TouchableOpacity
                  style={[styles.submitButton, { marginTop: 16, backgroundColor: '#1d4ed8' }]}
                  onPress={() => {
                    setTrasladoDetailModalVisible(false);
                    imprimirReporteTraslado({
                      bodega_origen: selectedTraslado.primero.bodega_origen,
                      bodega_destino: selectedTraslado.primero.bodega_destino,
                      motivo: selectedTraslado.primero.motivo,
                      usuario: selectedTraslado.primero.usuario,
                      fecha: selectedTraslado.primero.fecha,
                      items: selectedTraslado.items.map(it => ({
                        nombre: it.producto_nombre,
                        cantidad: it.cantidad
                      }))
                    });
                  }}
                >
                  <Ionicons name="print-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitButtonText}>Imprimir Comprobante</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL STOCK DE BODEGA */}
      <Modal
        visible={bodegaStockModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setBodegaStockModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stock: {bodegaStockVisible}</Text>
              <TouchableOpacity onPress={() => setBodegaStockModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>
            {loadingBodegaStock ? (
              <ActivityIndicator color="#3b82f6" style={{ marginVertical: 20 }} />
            ) : bodegaStockItems.length === 0 ? (
              <Text style={styles.emptyText}>Esta bodega no tiene stock registrado.</Text>
            ) : (
              <FlatList
                data={bodegaStockItems}
                keyExtractor={i => i.id.toString()}
                style={{ maxHeight: '70%' }}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#1e293b' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: '600' }}>{item.nombre}</Text>
                      <Text style={{ color: '#64748b', fontSize: 11 }}>{item.categoria || 'Sin categoria'}</Text>
                    </View>
                    <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '700' }}>{item.cantidad} u.</Text>
                  </View>
                )}
              />
            )}

            {bodegaStockVisible === 'merma' && bodegaStockItems.length > 0 && (
              <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#334155', marginTop: 10 }}>
                <TouchableOpacity
                  style={{ 
                    backgroundColor: '#ef4444', 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: 12, 
                    borderRadius: 8
                  }}
                  onPress={handleDiscardAllMerma}
                  disabled={submittingGeneralDiscard}
                >
                  {submittingGeneralDiscard ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 13 }}>Descartar Toda la Merma (Baja General)</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>


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
          style={[styles.tabBarButton, activeTab === 'facturar' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('facturar')}
        >
          <Ionicons
            name={activeTab === 'facturar' ? 'cart' : 'cart-outline'}
            size={20}
            color={activeTab === 'facturar' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'facturar' && styles.tabBarTextActive]}>Facturar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, activeTab === 'conteos' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('conteos')}
        >
          <Ionicons
            name={activeTab === 'conteos' ? 'clipboard' : 'clipboard-outline'}
            size={20}
            color={activeTab === 'conteos' ? '#3b82f6' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'conteos' && styles.tabBarTextActive]}>Auditar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBarButton, sidebarVisible && styles.tabBarButtonActive]}
          onPress={() => setSidebarVisible(true)}
        >
          <Ionicons
            name="menu"
            size={20}
            color="#94a3b8"
          />
          <Text style={styles.tabBarText}>Menú</Text>
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
                <Text style={styles.formLabel}>Seleccione Proveedor *</Text>
                <TouchableOpacity
                  style={[styles.formInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => setShowSupplierDropdown(!showSupplierDropdown)}
                >
                  <Text style={{ color: poProveedor ? '#f8fafc' : '#64748b', fontSize: 14 }}>
                    {poProveedor || 'Seleccionar de la lista...'}
                  </Text>
                  <Ionicons name={showSupplierDropdown ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color="#94a3b8" />
                </TouchableOpacity>

                {showSupplierDropdown && (
                  <View style={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderWidth: 1,
                    borderRadius: 6,
                    marginTop: 4,
                    maxHeight: 150,
                  }}>
                    <ScrollView nestedScrollEnabled={true}>
                      {suppliers.map((sup) => (
                        <TouchableOpacity
                          key={sup.id}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: '#334155',
                            backgroundColor: poProveedorId === sup.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
                          }}
                          onPress={() => {
                            handleSelectSupplier(sup.id);
                            setShowSupplierDropdown(false);
                          }}
                        >
                          <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: poProveedorId === sup.id ? '700' : '400' }}>
                            {sup.nombre}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {suppliers.length === 0 && (
                        <Text style={{ color: '#64748b', padding: 12, fontSize: 13, textAlign: 'center' }}>
                          No hay proveedores creados en el sistema.
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                )}
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
                        {item.cantidad_ordenada} unidades x C${item.costo_unitario.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={styles.poItemTotal}>
                      C${(item.cantidad_ordenada * item.costo_unitario).toFixed(2)}
                    </Text>
                    <TouchableOpacity style={styles.removeIcon} onPress={() => handleRemovePoItem(idx)}>
                      <Ionicons name="trash-outline" size={16} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Totales y Cálculo de IVA 15% */}
              <View style={styles.poTotalSummary}>
                <View style={styles.poTotalLine}>
                  <Text style={styles.poTotalLineLabel}>Subtotal Costo:</Text>
                  <Text style={styles.poTotalLineVal}>C${poSubtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.poTotalLine}>
                  <Text style={styles.poTotalLineLabel}>IVA (15%):</Text>
                  <Text style={styles.poTotalLineVal}>C${poIva.toFixed(2)}</Text>
                </View>
                <View style={[styles.poTotalLine, { borderTopWidth: 1, borderColor: '#334155', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={styles.poTotalLabel}>Total con IVA:</Text>
                  <Text style={styles.poTotalValue}>C${poTotal.toFixed(2)}</Text>
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
                <View style={[styles.pickerSelector, { maxHeight: 150 }]}>
                  <ScrollView nestedScrollEnabled={true}>
                    {poCatalogFiltered.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.pickerItem, selectedProduct?.id === item.id && styles.pickerItemActive]}
                        onPress={() => {
                          setSelectedProduct(item);
                          setPoItemCost(item.precio.toString());
                        }}
                      >
                        <Text style={styles.pickerItemText}>{item.nombre}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
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
                  <Text style={styles.poSummaryReceiveSub}>Total orden: C${Number(receivingPo.total_con_iva).toFixed(2)} (IVA inc.)</Text>
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

              {/* Referencia del Cálculo en Sistema */}
              <View style={{ backgroundColor: '#0f172a', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#1e293b' }}>
                <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>CÁLCULO DE SISTEMA (Según cantidades recibidas):</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Subtotal Esperado: <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>C$${calcSistemaSubtotal().toFixed(2)}</Text></Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 12 }}>IVA Esperado: <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>C$${calcSistemaIva().toFixed(2)}</Text></Text>
                </View>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: '#1e293b', borderRadius: 6, marginTop: 4, borderWidth: 1, borderColor: '#334155' }}
                  onPress={() => {
                    setReceivingSubtotal(calcSistemaSubtotal().toFixed(2));
                    setReceivingIva(calcSistemaIva().toFixed(2));
                  }}
                >
                  <Ionicons name="copy-outline" size={14} color="#60a5fa" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#60a5fa', fontSize: 11, fontWeight: '600' }}>Copiar montos a campos de factura</Text>
                </TouchableOpacity>
              </View>

              {/* Campos de Subtotal e IVA de Factura Física */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={[styles.formGroup, { width: '48%' }]}>
                  <Text style={styles.formLabel}>Subtotal Factura *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={receivingSubtotal}
                    onChangeText={setReceivingSubtotal}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={[styles.formGroup, { width: '48%' }]}>
                  <Text style={styles.formLabel}>IVA Factura *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={receivingIva}
                    onChangeText={setReceivingIva}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              {/* Total Calculado Dinámico */}
              <View style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderHorizontalWidth: 1, borderColor: '#334155' }}>
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>Total Factura (Calculado):</Text>
                <Text style={{ color: '#60a5fa', fontSize: 18, fontWeight: '800', marginTop: 2 }}>
                  C${((parseFloat(receivingSubtotal) || 0) + (parseFloat(receivingIva) || 0)).toFixed(2)}
                </Text>
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

      {/* MODAL CREAR NUEVO PRODUCTO (ADMIN) */}
      <Modal
        visible={productModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeProductModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Producto / Licor</Text>
              <TouchableOpacity onPress={closeProductModal}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre del Licor *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formProdNombre}
                  onChangeText={setFormProdNombre}
                  placeholder="Ej: Ron Flor de Caña 18 Años"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Descripción</Text>
                <TextInput
                  style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
                  value={formProdDescripcion}
                  onChangeText={setFormProdDescripcion}
                  placeholder="Detalles del licor, presentación..."
                  placeholderTextColor="#64748b"
                  multiline={true}
                />
              </View>

              {/* Selector de Categoría */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Categoría</Text>
                <View style={{ backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', padding: 4 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                      style={[
                        styles.categoryFilterButton,
                        !formProdCategoriaId && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                      ]}
                      onPress={() => setFormProdCategoriaId(null)}
                    >
                      <Text style={[styles.categoryFilterButtonText, !formProdCategoriaId && { color: '#ffffff' }]}>Sin Categoría</Text>
                    </TouchableOpacity>
                    {categoriesList.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryFilterButton,
                          formProdCategoriaId === cat.id && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
                          { marginLeft: 6 }
                        ]}
                        onPress={() => setFormProdCategoriaId(cat.id)}
                      >
                        <Text style={[styles.categoryFilterButtonText, formProdCategoriaId === cat.id && { color: '#ffffff' }]}>{cat.nombre}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Costo del Producto (C$)</Text>
                <TextInput
                  style={styles.formInput}
                  value={formProdCosto}
                  onChangeText={setFormProdCosto}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={[styles.formGroup, { width: '48%' }]}>
                  <Text style={styles.formLabel}>% IVA</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formProdIva}
                    onChangeText={setFormProdIva}
                    keyboardType="numeric"
                    placeholder="15"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={[styles.formGroup, { width: '48%' }]}>
                  <Text style={styles.formLabel}>% Utilidad</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formProdUtilidad}
                    onChangeText={setFormProdUtilidad}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Stock Inicial (Bodega Principal)</Text>
                <TextInput
                  style={styles.formInput}
                  value={formProdStock}
                  onChangeText={setFormProdStock}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#64748b"
                />
              </View>

              {/* Precio Calculado */}
              <View style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#334155' }}>
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>Precio de Venta Estimado (IVA inc.):</Text>
                <Text style={{ color: '#10b981', fontSize: 20, fontWeight: '800', marginTop: 2 }}>
                  C${(() => {
                    const c = parseFloat(formProdCosto) || 0;
                    const iva = parseFloat(formProdIva) || 0;
                    const util = parseFloat(formProdUtilidad) || 0;
                    return (c * (1 + iva/100) * (1 + util/100)).toFixed(2);
                  })()}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={handleSaveProduct}
                disabled={submittingProduct}
              >
                {submittingProduct ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#ffffff" size="small" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Guardando...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="save-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Crear Producto</Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL PARAMETRIZAR PRODUCTO (ADMIN) */}
      <Modal
        visible={paramModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setParamModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Parametrizar Licor</Text>
              <TouchableOpacity onPress={() => setParamModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {paramProduct && (
                <View style={styles.poSummaryReceive}>
                  <Text style={styles.poSummaryReceiveTitle}>{paramProduct.nombre}</Text>
                  <Text style={styles.poSummaryReceiveSub}>ID Ref: #{paramProduct.id} | Categoría: {paramProduct.categoria}</Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Costo del Producto (C$)</Text>
                <TextInput
                  style={styles.formInput}
                  value={paramCosto}
                  onChangeText={setParamCosto}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={[styles.formGroup, { width: '48%' }]}>
                  <Text style={styles.formLabel}>% IVA</Text>
                  <TextInput
                    style={styles.formInput}
                    value={paramIva}
                    onChangeText={setParamIva}
                    keyboardType="numeric"
                    placeholder="15"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <View style={[styles.formGroup, { width: '48%' }]}>
                  <Text style={styles.formLabel}>% Utilidad</Text>
                  <TextInput
                    style={styles.formInput}
                    value={paramUtilidad}
                    onChangeText={setParamUtilidad}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              {/* Precio Calculado en Tiempo Real */}
              <View style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#334155' }}>
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>Precio de Venta Calculado (IVA inc.):</Text>
                <Text style={{ color: '#10b981', fontSize: 20, fontWeight: '800', marginTop: 2 }}>
                  C${(() => {
                    const c = parseFloat(paramCosto) || 0;
                    const iva = parseFloat(paramIva) || 0;
                    const util = parseFloat(paramUtilidad) || 0;
                    return (c * (1 + iva/100) * (1 + util/100)).toFixed(2);
                  })()}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                  Fórmula: Costo × (1 + %IVA) × (1 + %Utilidad)
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.submitButtonApply, { backgroundColor: '#3b82f6' }]}
                onPress={handleSaveParams}
                disabled={submittingParam}
              >
                {submittingParam ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>Guardar Parámetros</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL REPORTE IMPRIMIBLE DE VENTAS POR VENDEDOR */}
      <Modal
        visible={reportModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reporte Oficial de Ventas</Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Hoja de Trabajo Corporativa */}
              <View style={styles.printSheet}>
                <View style={styles.printSheetHeader}>
                  <Text style={styles.printSheetTitle}>HOJA DE REPORTE - CONTROL DE VENTAS POR VENDEDOR</Text>
                  <Text style={styles.printSheetMeta}>Licorería | Módulo de Auditoría Comercial</Text>
                  <Text style={styles.printSheetMeta}>Generado por: {user.nombre} (Administrador)</Text>
                  <Text style={styles.printSheetMeta}>Fecha de Emisión: {new Date().toLocaleString('es-ES')}</Text>
                </View>

                {/* Tabla de Datos */}
                <View style={styles.printTableHead}>
                  <Text style={[styles.printTableCol, { flex: 2, fontWeight: 'bold' }]}>Vendedor / Correo</Text>
                  <Text style={[styles.printTableCol, { flex: 1, fontWeight: 'bold', textAlign: 'center' }]}>Cant. Ventas</Text>
                  <Text style={[styles.printTableCol, { flex: 1, fontWeight: 'bold', textAlign: 'right' }]}>Total Vendido</Text>
                </View>

                {salesBySeller.vendedores.map((item) => (
                  <View key={item.id} style={styles.printTableRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={[styles.printTableRowText, { fontWeight: '600' }]}>{item.nombre}</Text>
                      <Text style={[styles.printTableRowText, { color: '#64748b', fontSize: 10 }]}>{item.email}</Text>
                    </View>
                    <Text style={[styles.printTableRowText, { flex: 1, textAlign: 'center' }]}>{item.cantidadVentas}</Text>
                    <Text style={[styles.printTableRowText, { flex: 1, textAlign: 'right', fontWeight: 'bold' }]}>
                      C${item.totalVendido.toFixed(2)}
                    </Text>
                  </View>
                ))}

                {/* Resumen Total */}
                <View style={styles.printSheetSummaryBlock}>
                  <View style={styles.printSheetSummaryLine}>
                    <Text style={styles.printSheetSummaryLabel}>VENTAS TOTALES TIENDA (IVA Inc.):</Text>
                    <Text style={styles.printSheetSummaryVal}>C${salesBySeller.totalTienda.toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.printSheetFooter}>
                  <Text style={styles.printSheetSignLine}>Firma Administrador: _________________________</Text>
                  <Text style={[styles.printSheetMeta, { fontSize: 8, marginTop: 12, textAlign: 'center', width: '100%' }]}>
                    Este documento representa el informe oficial de caja del periodo de ventas acumulado.
                  </Text>
                </View>
              </View>

              {/* Acciones del Reporte */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                <TouchableOpacity 
                  style={[styles.submitButtonApply, { flex: 1, marginRight: 8, backgroundColor: '#3b82f6' }]} 
                  onPress={handlePrintSalesReport}
                >
                  <Ionicons name="print-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitButtonText}>Imprimir Carta</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.submitButtonApply, { flex: 1, backgroundColor: '#10b981' }]} 
                  onPress={handleExportSalesReportExcel}
                >
                  <Ionicons name="share-social-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitButtonText}>Exportar Excel</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.submitButtonApply, { backgroundColor: '#475569', marginTop: 10 }]} onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.submitButtonText}>Cerrar Reporte</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL CREAR / EDITAR PROVEEDOR */}
      <Modal
        visible={supplierModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSupplierModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingSupplier ? 'Modificar Proveedor' : 'Crear Nuevo Proveedor'}
              </Text>
              <TouchableOpacity onPress={() => setSupplierModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nombre del Proveedor *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSupNombre}
                  onChangeText={setFormSupNombre}
                  placeholder="Ej. Licores de la Costa"
                  placeholderTextColor="#64748b"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Teléfono</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSupTelefono}
                  onChangeText={setFormSupTelefono}
                  placeholder="Ej. +505 8888-8888"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Correo Electrónico</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSupEmail}
                  onChangeText={setFormSupEmail}
                  placeholder="proveedor@licores.com"
                  placeholderTextColor="#64748b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Dirección</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSupDireccion}
                  onChangeText={setFormSupDireccion}
                  placeholder="Ej. Km 10 Carretera Masaya"
                  placeholderTextColor="#64748b"
                  multiline={true}
                  numberOfLines={3}
                />
              </View>

              {/* Contraseña admin requerida si se está CREANDO un proveedor */}
              {!editingSupplier && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Contraseña de Administrador *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={authPassword}
                    onChangeText={setAuthPassword}
                    placeholder="Ingrese su contraseña para confirmar"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={true}
                    autoCapitalize="none"
                  />
                </View>
              )}

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveSupplier}
                disabled={submittingSupplier}
              >
                {submittingSupplier ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>
                      {editingSupplier ? 'Guardar Cambios' : 'Crear Proveedor'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL ASOCIAR LICORES A PROVEEDOR */}
      <Modal
        visible={associateModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setAssociateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Asociar Licores - {associatingSupplier?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setAssociateModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <Text style={[styles.formLabel, { marginHorizontal: 20, marginTop: 10, marginBottom: 4 }]}>
              Seleccione los productos que suministra este proveedor:
            </Text>

            <FlatList
              data={catalogForAssociation}
              keyExtractor={(item) => item.id.toString()}
              extraData={selectedProductIds}
              style={{ flex: 1, paddingHorizontal: 20, marginVertical: 10 }}
              renderItem={({ item }) => {
                const isSelected = selectedProductIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : '#1e293b',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isSelected ? '#3b82f6' : '#334155'
                    }}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedProductIds(selectedProductIds.filter(id => id !== item.id));
                      } else {
                        setSelectedProductIds([...selectedProductIds, item.id]);
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: '700' }}>
                        {item.nombre}
                      </Text>
                      <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                        Categoría: {item.categoria_nombre || item.categoria || 'Sin categoría'}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkbox-outline' : 'square-outline'}
                      size={20}
                      color={isSelected ? '#3b82f6' : '#94a3b8'}
                    />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No hay productos registrados en catálogo.</Text>
              }
            />

            <View style={{ padding: 20, borderTopWidth: 1, borderColor: '#334155' }}>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveAssociation}
                disabled={savingAssociation}
              >
                {savingAssociation ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Guardar Asociaciones</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CALENDARIO INTERACTIVO (DATE PICKER) */}
      <Modal
        visible={calendarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.modalContentCenter, { width: '90%', maxWidth: 350 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Seleccionar Fecha {calendarTarget === 'start' ? 'Desde' : 'Hasta'}
              </Text>
              <TouchableOpacity onPress={() => setCalendarVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            {/* Selector de Mes/Año */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={handlePrevMonth} style={{ padding: 6 }}>
                <Ionicons name="chevron-back-outline" size={20} color="#60a5fa" />
              </TouchableOpacity>
              <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700' }}>
                {monthsEs[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={{ padding: 6 }}>
                <Ionicons name="chevron-forward-outline" size={20} color="#60a5fa" />
              </TouchableOpacity>
            </View>

            {/* Días de la Semana */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((d, index) => (
                <Text key={index} style={{ color: '#64748b', fontSize: 12, fontWeight: '600', width: 32, textAlign: 'center' }}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Cuadrícula de Días */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              {(() => {
                const cells = [];
                const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
                const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);

                // Celdas vacías previas
                for (let i = 0; i < firstDay; i++) {
                  cells.push(
                    <View key={`empty-${i}`} style={{ width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' }} />
                  );
                }

                // Días reales
                for (let day = 1; day <= daysInMonth; day++) {
                  const dayDate = new Date(calendarYear, calendarMonth, day);
                  const isToday = new Date().toDateString() === dayDate.toDateString();
                  let targetDate = poStartDateFilter;
                  if (calendarTarget === 'end') targetDate = poEndDateFilter;
                  else if (calendarTarget === 'mvt_start') targetDate = mvtStartDateFilter;
                  else if (calendarTarget === 'mvt_end') targetDate = mvtEndDateFilter;
                  const isSelected = targetDate && targetDate.toDateString() === dayDate.toDateString();

                  cells.push(
                    <TouchableOpacity
                      key={`day-${day}`}
                      style={{
                        width: '14.28%',
                        aspectRatio: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRadius: 16,
                        backgroundColor: isSelected ? '#3b82f6' : isToday ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                        borderColor: isToday ? '#60a5fa' : 'transparent',
                        borderWidth: isToday ? 1 : 0
                      }}
                      onPress={() => handleSelectDay(day)}
                    >
                      <Text style={{
                        color: isSelected ? '#ffffff' : '#f8fafc',
                        fontSize: 13,
                        fontWeight: isSelected || isToday ? '700' : '400'
                      }}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                }

                return cells;
              })()}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL AUTORIZACIÓN PARA ELIMINAR PROVEEDOR */}
      <Modal
        visible={deleteAuthModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteAuthModalVisible(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Autorizar Eliminación</Text>
              <TouchableOpacity onPress={() => setDeleteAuthModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '700', marginBottom: 16, textAlign: 'center' }}>
                Se requieren credenciales de administrador para eliminar al proveedor "{deleteSupplierTarget?.nombre}".
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Usuario / Correo Admin *</Text>
                <TextInput
                  style={styles.formInput}
                  value={deleteAdminEmail}
                  onChangeText={setDeleteAdminEmail}
                  placeholder="admin@sistema.com"
                  placeholderTextColor="#64748b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Contraseña Admin *</Text>
                <TextInput
                  style={styles.formInput}
                  value={deleteAdminPassword}
                  onChangeText={setDeleteAdminPassword}
                  placeholder="Ingrese contraseña de confirmación"
                  placeholderTextColor="#64748b"
                  secureTextEntry={true}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#ef4444', marginTop: 10 }]}
                onPress={handleConfirmDeleteSupplier}
                disabled={submittingDeleteAuth}
              >
                {submittingDeleteAuth ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={20} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.submitButtonText}>Confirmar Eliminación</Text>
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
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalContentCenter}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apertura de Caja</Text>
              <TouchableOpacity onPress={() => setAperturaModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
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
    borderColor: 'rgba(59, 130, 246, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    marginBottom: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3
  },
  loaderLogoInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
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
  },
  sellerRowCard: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  sellerRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  sellerRowName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  sellerRowEmail: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1
  },
  sellerRowTotal: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '800'
  },
  sellerRowSub: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3
  },
  sellerRowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  sellerMetaLabel: {
    color: '#64748b',
    fontSize: 10
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
    fontSize: 12,
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
    paddingVertical: 8,
    alignItems: 'center'
  },
  printTableRowText: {
    color: '#000000',
    fontSize: 11
  },
  printSheetSummaryBlock: {
    borderTopWidth: 2,
    borderTopColor: '#000000',
    marginTop: 12,
    paddingTop: 8
  },
  printSheetSummaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  printSheetSummaryLabel: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800'
  },
  printSheetSummaryVal: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900'
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
  kardexSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  kardexSummaryCard: {
    width: '48%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3b82f6',
    alignItems: 'center'
  },
  kardexSummaryVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3b82f6',
    marginTop: 4
  },
  kardexSummaryLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    textAlign: 'center'
  },
  kardexCatalogRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  kardexCatalogName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  kardexCatalogSub: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2
  },
  kardexCatalogStock: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  stockStatusIndicator: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 3,
    borderWidth: 0.5,
    marginTop: 3
  },
  stockStatusIndicatorText: {
    fontSize: 8,
    fontWeight: '700'
  },
  kardexCatalogPrice: {
    color: '#cbd5e1',
    fontSize: 11,
    textAlign: 'right'
  },
  kardexCatalogTotal: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'right'
  },
  mvtCard: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12
  },
  mvtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#334155',
    paddingBottom: 6,
    marginBottom: 8
  },
  mvtBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1
  },
  mvtBadge_entrada: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  mvtBadgeText_entrada: {
    color: '#34d399',
    fontSize: 9,
    fontWeight: '800'
  },
  mvtBadge_salida: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  mvtBadgeText_salida: {
    color: '#f87171',
    fontSize: 9,
    fontWeight: '800'
  },
  mvtBadge_ajuste: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  mvtBadgeText_ajuste: {
    color: '#60a5fa',
    fontSize: 9,
    fontWeight: '800'
  },
  mvtRefText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700'
  },
  mvtBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  mvtProductName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2
  },
  mvtMetaText: {
    color: '#64748b',
    fontSize: 10
  },
  mvtDateText: {
    color: '#64748b',
    fontSize: 9,
    marginTop: 4
  },
  mvtQtyText: {
    fontSize: 16,
    fontWeight: '800'
  },
  mvtQty_entrada: {
    color: '#10b981'
  },
  mvtQty_salida: {
    color: '#ef4444'
  },
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6
  },
  subTabButtonActive: {
    backgroundColor: '#3b82f6'
  },
  subTabText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600'
  },
  subTabTextActive: {
    color: '#ffffff'
  },
  categoryFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8
  },
  categoryFilterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6'
  },
  categoryFilterButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  categoryFilterButtonTextActive: {
    color: '#ffffff'
  },
  sidebarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row'
  },
  sidebarCloseArea: {
    flex: 1
  },
  sidebarContent: {
    width: '75%',
    maxWidth: 300,
    backgroundColor: '#1e293b',
    height: '100%',
    borderRightWidth: 1,
    borderColor: '#334155',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 20,
    display: 'flex',
    flexDirection: 'column'
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderColor: '#334155'
  },
  sidebarAdminInfo: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  sidebarAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sidebarAdminName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800'
  },
  sidebarAdminRole: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  sidebarItems: {
    flex: 1,
    paddingTop: 15
  },
  sidebarSectionTitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginVertical: 10,
    letterSpacing: 1
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderLeftWidth: 3,
    borderColor: '#3b82f6'
  },
  sidebarItemText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600'
  },
  sidebarItemTextActive: {
    color: '#3b82f6',
    fontWeight: '700'
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 15,
    marginHorizontal: 20
  },
  sidebarLogoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: '#334155',
    marginTop: 'auto'
  },
  sidebarLogoutText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700'
  },
  respaldoContainer: {
    padding: 10,
    gap: 16
  },
  respaldoDescription: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8
  },
  respaldoCard: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    gap: 14,
    marginBottom: 16
  },
  respaldoIconWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start'
  },
  respaldoContent: {
    flex: 1,
    gap: 8
  },
  respaldoCardTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  respaldoCardText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16
  },
  respaldoButton: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6
  },
  restoreButton: {
    backgroundColor: '#dc2626'
  },
  respaldoButtonText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700'
  },
  disabledButton: {
    opacity: 0.5
  },
  restoreModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  restoreModalContent: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center'
  },
  restoreModalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  restoreModalText: {
    color: '#94a3b8',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20
  },
  progressBarWrapper: {
    height: 8,
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4
  },
  restoreProgressText: {
    color: '#64748b',
    fontSize: 11.5,
    fontWeight: '600'
  }
});

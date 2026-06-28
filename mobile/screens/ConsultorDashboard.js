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
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function ConsultorDashboard({ token, user, onLogout }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('conteos'); // 'conteos', 'historial', 'perfil'
  const [conteoAutorizado, setConteoAutorizado] = useState(true);

  // Auditoría e Inventario
  const [counts, setCounts] = useState([]);
  const [categorias, setCategorias] = useState([]);
  
  // Detalle de Conteo Activo
  const [activeCount, setActiveCount] = useState(null);
  const [activeCountDetails, setActiveCountDetails] = useState(null);
  const [countedValues, setCountedValues] = useState({});
  const [observacionesValues, setObservacionesValues] = useState({}); // F14: Observaciones por producto
  const [showNewCountModal, setShowNewCountModal] = useState(false);
  const [countModalStep, setCountModalStep] = useState('select_bodega'); // 'select_bodega' | 'select_category' | 'discard'
  const [newCountBodega, setNewCountBodega] = useState(null);
  const [newCountCategory, setNewCountCategory] = useState(null);
  const [submittingStart, setSubmittingStart] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // F13: Buscador en conteo activo
  const [countSearch, setCountSearch] = useState('');

  // F15: Historial de conteos aplicados
  const [historialConteos, setHistorialConteos] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [ventasDesdeConteo, setVentasDesdeConteo] = useState(null);
  // Filtros de fecha del historial
  const [historialDesde, setHistorialDesde] = useState('');
  const [historialHasta, setHistorialHasta] = useState('');
  const [historialFechaError, setHistorialFechaError] = useState('');
  // Modal de detalle del historial (para reimprimir)
  const [historialDetailVisible, setHistorialDetailVisible] = useState(false);
  const [historialDetailData, setHistorialDetailData] = useState(null); // { header, items }
  const [loadingHistorialDetail, setLoadingHistorialDetail] = useState(false);

  // Verificación de credenciales
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [applyEmail, setApplyEmail] = useState(user.email || '');
  const [applyPassword, setApplyPassword] = useState('');
  const [submittingApply, setSubmittingApply] = useState(false);

  // Estados para modal de autorización de descarte de merma
  const [mermaItemsForDiscard, setMermaItemsForDiscard] = useState([]);
  const [activeCountHasMerma, setActiveCountHasMerma] = useState(false);


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

  useEffect(() => {
    if (activeTab === 'historial') fetchHistorial();
  }, [activeTab]);

  const fetchHistorial = async (desde = '', hasta = '') => {
    setLoadingHistorial(true);
    try {
      let url = `${API_URL}/inventory-counts/historial`;
      const params = [];
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        // Mapear precision y campos necesarios desde la respuesta del API
        const historialMapeado = (d.historial || []).map(c => ({
          ...c,
          precision: c.porcentaje_precision ?? 100,
          total_productos: c.total_sistema || 0,
          total_productos_contados: c.total_productos_contados || 0,
          fecha_aplicacion: c.fecha_aplicado,
          aplicado_por: c.consultor_nombre,
          bodega_id: c.bodega_id || 1,
          bodega_nombre: c.bodega_nombre || 'Bodega Principal',
        }));
        setHistorialConteos(historialMapeado);
        setVentasDesdeConteo(d.bloqueoPorMovimiento?.ventasDesde ?? null);
      }
    } catch (e) { console.log('Error historial:', e); }
    finally { setLoadingHistorial(false); }
  };

  const fetchHistorialConFiltro = () => {
    // Validar que desde <= hasta
    if (historialDesde && historialHasta) {
      if (new Date(historialDesde) > new Date(historialHasta)) {
        setHistorialFechaError('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
        return;
      }
    }
    setHistorialFechaError('');
    fetchHistorial(historialDesde, historialHasta);
  };

  const fetchHistorialDetalle = async (conteoId) => {
    setLoadingHistorialDetail(true);
    setHistorialDetailVisible(true);
    try {
      const resp = await fetch(`${API_URL}/inventory-counts/${conteoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setHistorialDetailData(data);
      } else {
        Alert.alert('Error', 'No se pudo cargar el detalle del conteo.');
        setHistorialDetailVisible(false);
      }
    } catch (e) {
      console.log('Error detalle historial:', e);
      Alert.alert('Error de red', 'No se pudo conectar al servidor.');
      setHistorialDetailVisible(false);
    } finally {
      setLoadingHistorialDetail(false);
    }
  };

  // Imprimir hoja de trabajo desde cualquier objeto de conteo (no solo el activo)
  const printWorksheetFromData = async (countData) => {
    if (!countData) return;
    const itemsHtml = countData.items.map((item, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>#${item.producto_id}</td>
        <td><strong>${item.producto_nombre}</strong></td>
        <td style="text-align:center;font-size:14px;color:#999;font-family:monospace;">[ &nbsp; &nbsp; &nbsp; &nbsp; ]</td>
      </tr>
    `).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hoja de Trabajo</title>
      <style>@page{size:letter;margin:15mm}body{font-family:Arial,sans-serif;color:#333;line-height:1.4;padding:10px}
      .header{border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px;text-align:center}
      .header h1{font-size:18px;margin:0;text-transform:uppercase}.header p{font-size:11px;margin:5px 0 0;color:#555}
      .meta{font-size:11px;margin-bottom:20px;display:flex;justify-content:space-between}
      table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:10px;text-align:left;font-size:11px}
      th{background:#f2f2f2;font-weight:bold;text-transform:uppercase}
      .sig{margin-top:60px}.sig-line{width:250px;border-top:1px solid #000;text-align:center;font-size:11px;padding-top:5px;margin-top:40px}</style>
      </head><body>
      <div class="header"><h1>HOJA DE TRABAJO - CONTROL DE INVENTARIO FÍSICO</h1><p>Licorería | Auditoría de Existencias (Reimpresión)</p></div>
      <div class="meta">
        <div><strong>Conteo ID:</strong> #${countData.header.id}<br><strong>Bodega:</strong> ${countData.header.bodega_nombre || 'Bodega Principal'}<br>
        <strong>Categoría:</strong> ${countData.header.categoria_nombre}<br><strong>Fecha Aplicación:</strong> ${countData.header.fecha_aplicado ? new Date(countData.header.fecha_aplicado).toLocaleDateString('es-ES') : 'N/A'}</div>
        <div><strong>Estado:</strong> ${(countData.header.estado || '').toUpperCase()}</div>
      </div>
      <table><thead><tr><th style="width:8%;text-align:center">N°</th><th style="width:15%">Ref ID</th><th style="width:52%">Producto / Licor</th><th style="width:25%;text-align:center">Conteo Físico Real</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <div class="sig"><div class="sig-line">Firma Auditor / Consultor</div></div>
      </body></html>`;
    try { await Print.printAsync({ html }); }
    catch (e) { Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.'); }
  };

  // Imprimir reporte de diferencias desde cualquier objeto de conteo
  const printDiffReportFromData = async (countData) => {
    if (!countData) return;
    const hasDiff = (countData.items || []).some(i => Number(i.diferencia) !== 0);
    if (!hasDiff) { Alert.alert('Información', 'No hay datos para reporte'); return; }
    const itemsHtml = countData.items.map(item => {
      const sign = item.diferencia > 0 ? '+' : '';
      const val = item.diferencia * (Number(item.costo) || 0);
      const valText = val >= 0 ? `+C$${val.toFixed(2)}` : `-C$${Math.abs(val).toFixed(2)}`;
      const valColor = val === 0 ? '#000' : val < 0 ? '#dc2626' : '#16a34a';
      return `<tr><td>#${item.producto_id}</td><td><strong>${item.producto_nombre}</strong></td>
        <td style="text-align:center">${item.cantidad_sistema} u.</td>
        <td style="text-align:center">${item.cantidad_contada ?? '—'} u.</td>
        <td style="text-align:center;font-weight:bold">${sign}${item.diferencia} u.</td>
        <td style="text-align:center;font-weight:bold;color:${valColor}">${valText}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe Diferencias</title>
      <style>@page{size:letter;margin:15mm}body{font-family:Arial,sans-serif;color:#333;line-height:1.4;padding:10px}
      .header{border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px;text-align:center}
      .header h1{font-size:18px;margin:0;text-transform:uppercase}.header p{font-size:11px;margin:5px 0 0;color:#555}
      .meta{font-size:11px;margin-bottom:20px;display:flex;justify-content:space-between}
      table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:10px;text-align:left;font-size:11px}
      th{background:#f2f2f2;font-weight:bold;text-transform:uppercase}
      .sig-row{margin-top:60px;display:flex;justify-content:space-between}
      .sig-line{width:220px;border-top:1px solid #000;text-align:center;font-size:11px;padding-top:5px;margin-top:40px}</style>
      </head><body>
      <div class="header"><h1>INFORME DE AUDITORÍA - DIFERENCIAS DE INVENTARIO</h1><p>Licorería | Ajuste y Conciliación de Existencias (Reimpresión)</p></div>
      <div class="meta">
        <div><strong>Conteo ID:</strong> #${countData.header.id}<br><strong>Bodega:</strong> ${countData.header.bodega_nombre || 'Bodega Principal'}<br>
        <strong>Categoría:</strong> ${countData.header.categoria_nombre}<br><strong>Fecha Aplicación:</strong> ${countData.header.fecha_aplicado ? new Date(countData.header.fecha_aplicado).toLocaleString('es-ES') : 'N/A'}</div>
        <div><strong>Estado:</strong> APLICADO A PRODUCCIÓN</div>
      </div>
      <table><thead><tr><th style="width:12%">Ref ID</th><th style="width:36%">Producto / Licor</th>
        <th style="width:14%;text-align:center">Stock Sistema</th><th style="width:14%;text-align:center">Stock Contado</th>
        <th style="width:12%;text-align:center">Diferencia</th><th style="width:12%;text-align:center">Valor Dif.</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <div class="sig-row"><div class="sig-line">Firma Auditor / Consultor</div><div class="sig-line">Firma Administrador</div></div>
      </body></html>`;
    try { await Print.printAsync({ html }); }
    catch (e) { Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.'); }
  };


  // --- MÓDULO DE REPORTES: IMPRESIÓN Y EXPORTACIÓN A EXCEL (CONSULTOR) ---

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
      Alert.alert('Error', 'No se pudo exportar el conteo a Excel.');
    }
  };

  const handlePrintWorksheet = async () => {
    if (!activeCountDetails) return;
    
    const itemsHtml = activeCountDetails.items.map((item, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>#${item.producto_id}</td>
        <td><strong>${item.producto_nombre}</strong></td>
        <td style="text-align:center;font-size:14px;color:#999;font-family:monospace;">[ &nbsp; &nbsp; &nbsp; &nbsp; ]</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Hoja de Trabajo - Control de Inventario</title>
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
          .signature-block { margin-top: 60px; display: flex; justify-content: flex-start; }
          .signature-line { width: 250px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>HOJA DE TRABAJO - CONTROL DE INVENTARIO FÍSICO</h1>
          <p>Licorería | Auditoría de Existencias</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Auditoría / Conteo ID:</strong> #${activeCountDetails.header.id}<br>
            <strong>Bodega Auditada:</strong> ${activeCountDetails.header.bodega_nombre || 'Bodega Principal'}<br>
            <strong>Categoría Auditada:</strong> ${activeCountDetails.header.categoria_nombre}<br>
            <strong>Fecha de Creación:</strong> ${new Date(activeCountDetails.header.fecha_creacion).toLocaleDateString('es-ES')}
          </div>
          <div>
            <strong>Auditor Responsable:</strong> ${user.nombre}<br>
            <strong>Estado:</strong> ${activeCountDetails.header.estado.toUpperCase()}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 8%; text-align:center;">N°</th>
              <th style="width: 15%;">Ref ID</th>
              <th style="width: 52%;">Producto / Licor</th>
              <th style="width: 25%; text-align:center;">Conteo Físico Real</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="signature-block">
          <div class="signature-line">Firma Auditor / Consultor</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir hoja de trabajo:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handlePrintDiffReport = async () => {
    if (!activeCountDetails) return;

    // Verificar si todos los conteos han sido aplicados y no hay diferencias
    const hasDifferences = (activeCountDetails.items || []).some(
      item => Number(item.diferencia) !== 0
    );

    if (activeCountDetails.header.estado === 'aplicado' && !hasDifferences) {
      Alert.alert('Información', 'No hay datos para reporte');
      return;
    }

    const itemsHtml = activeCountDetails.items.map(item => {
      const diffSign = item.diferencia > 0 ? '+' : '';
      const diffVal = item.diferencia * (Number(item.costo) || 0);
      const diffValText = diffVal >= 0 ? `+C$${diffVal.toFixed(2)}` : `-C$${Math.abs(diffVal).toFixed(2)}`;
      const diffValColor = diffVal === 0 ? '#000' : (diffVal < 0 ? '#dc2626' : '#16a34a');
      
      return `
        <tr>
          <td>#${item.producto_id}</td>
          <td><strong>${item.producto_nombre}</strong></td>
          <td style="text-align:center;">${item.cantidad_sistema} u.</td>
          <td style="text-align:center;">${item.cantidad_contada} u.</td>
          <td style="text-align:center;font-weight:bold;">${diffSign}${item.diferencia} u.</td>
          <td style="text-align:center;font-weight:bold;color:${diffValColor};">${diffValText}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Informe de Diferencias de Inventario</title>
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
          .signature-row { margin-top: 60px; display: flex; justify-content: space-between; }
          .signature-line { width: 220px; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 5px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>INFORME DE AUDITORÍA - DIFERENCIAS DE INVENTARIO</h1>
          <p>Licorería | Ajuste y Conciliación de Existencias</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Conteo ID:</strong> #${activeCountDetails.header.id}<br>
            <strong>Bodega Conciliada:</strong> ${activeCountDetails.header.bodega_nombre || 'Bodega Principal'}<br>
            <strong>Categoría Conciliada:</strong> ${activeCountDetails.header.categoria_nombre}<br>
            <strong>Fecha de Aplicación:</strong> ${activeCountDetails.header.fecha_aplicado ? new Date(activeCountDetails.header.fecha_aplicado).toLocaleString('es-ES') : 'N/A'}
          </div>
          <div>
            <strong>Auditor Responsable:</strong> ${user.nombre}<br>
            <strong>Estado:</strong> APLICADO A PRODUCCIÓN
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Ref ID</th>
              <th style="width: 38%;">Producto / Licor</th>
              <th style="width: 14%; text-align:center;">Stock Sistema</th>
              <th style="width: 14%; text-align:center;">Stock Contado</th>
              <th style="width: 12%; text-align:center;">Diferencia</th>
              <th style="width: 10%; text-align:center;">Valor Dif. (Costo)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="signature-row">
          <div class="signature-line">Firma Auditor / Consultor</div>
          <div class="signature-line">Firma Administrador</div>
        </div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.log('Error al imprimir reporte diferencias:', error);
      Alert.alert('Error', 'No se pudo abrir el diálogo de impresión.');
    }
  };

  const handleExportCountExcel = () => {
    if (!activeCountDetails) return;
    
    const headers = ['Ref ID', 'Producto / Licor', 'Categoría', 'Stock Sistema', 'Stock Contado Físico', 'Diferencia (unidades)', 'Valor Diferencia (Costo)'];
    const rows = activeCountDetails.items.map(item => {
      const diffVal = item.diferencia !== null ? (item.diferencia * (Number(item.costo) || 0)) : 0;
      return [
        item.producto_id,
        item.producto_nombre,
        activeCountDetails.header.categoria_nombre,
        item.cantidad_sistema,
        item.cantidad_contada !== null ? item.cantidad_contada : 'No contado',
        item.diferencia !== null ? item.diferencia : 'N/A',
        item.diferencia !== null ? diffVal.toFixed(2) : 'N/A'
      ];
    });

    handleExportCSV(
      `Conteo #${activeCountDetails.header.id}`, 
      headers, 
      rows, 
      `conteo_inventario_${activeCountDetails.header.id}`
    );
  };

  const handleOpenCountDetails = async (countId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/inventory-counts/${countId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      
      // Consultar stock de merma en el sistema
      const mermaResp = await fetch(`${API_URL}/bodegas/merma/stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let hasMerma = false;
      if (mermaResp.ok) {
        const mermaData = await mermaResp.json();
        hasMerma = (mermaData.items || []).some(item => Number(item.cantidad) > 0);
      }

      setLoading(false);
      if (response.ok) {
        setActiveCount(countId);
        setActiveCountDetails(resData);
        setActiveCountHasMerma(hasMerma);
        
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

  const proceedStartCount = async (descartar = false) => {
    setSubmittingStart(true);
    try {
      const response = await fetch(`${API_URL}/inventory-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ categoria_id: newCountCategory, bodega_id: newCountBodega, descartarMerma: descartar })
      });
      const resData = await response.json();
      setSubmittingStart(false);

      if (response.ok) {
        Alert.alert('Éxito', 'Conteo de inventario iniciado.');
        setShowNewCountModal(false);
        setCountModalStep('select_bodega');
        setNewCountBodega(null);
        setMermaItemsForDiscard([]);
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

  const handlePrintMermaDiscardReport = async (itemsToDiscard) => {
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
        <title>Reporte de Descarte y Salida de Merma</title>
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
          <h1>REPORTE DE DESCARTE Y SALIDA DE MERMA</h1>
          <p>Licorería | Comprobante de Baja de Inventario de Mermas</p>
        </div>
        <div class="meta-info">
          <div>
            <strong>Fecha/Hora:</strong> ${new Date().toLocaleString('es-NI', { timeZone: 'America/Managua' })}<br>
            <strong>Categoría Auditada:</strong> ${categorias.find(c => c.id === newCountCategory)?.nombre || 'General'}<br>
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
          <div class="signature-line">Autorizado por (Admin/Encargado)</div>
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

  const handleDiscardMermaDuringCount = async () => {
    Alert.alert(
      'Confirmar Descarte',
      '¿Está seguro de que desea descartar todos los artículos de la Bodega de Merma en el sistema? Se generará un reporte PDF oficial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar y Descartar', 
          onPress: async () => {
            setLoading(true);
            try {
              // 1. Obtener stock de merma para el reporte
              const stockResp = await fetch(`${API_URL}/bodegas/merma/stock`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (!stockResp.ok) {
                setLoading(false);
                Alert.alert('Error', 'No se pudo obtener el stock de merma para el reporte.');
                return;
              }
              const stockData = await stockResp.json();
              const itemsToDiscard = (stockData.items || []).filter(item => Number(item.cantidad) > 0);
              
              if (itemsToDiscard.length === 0) {
                setLoading(false);
                Alert.alert('Info', 'No hay productos con stock en la Bodega de Merma.');
                return;
              }

              // 2. Imprimir reporte PDF
              await handlePrintMermaDiscardReport(itemsToDiscard);

              // 3. Enviar petición de descarte general
              const discardResp = await fetch(`${API_URL}/bodegas/merma/descartar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              setLoading(false);
              if (discardResp.ok) {
                Alert.alert('Éxito', 'Toda la merma ha sido descartada del sistema.');
                setActiveCountHasMerma(false);
              } else {
                const errData = await discardResp.json();
                Alert.alert('Error', errData.mensaje || 'No se pudo procesar el descarte general.');
              }
            } catch (error) {
              setLoading(false);
              console.log('Error descarte durante conteo:', error);
              Alert.alert('Error de red', 'No se pudo comunicar con el servidor.');
            }
          }
        }
      ]
    );
  };

  const handleSelectBodega = async (bodegaId) => {
    setSubmittingStart(true);
    try {
      const response = await fetch(`${API_URL}/bodegas/${bodegaId}/check-audit-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setSubmittingStart(false);

      if (response.ok) {
        if (resData.allCategoriesCounted) {
          Alert.alert('Información', 'No hay datos para reporte');
        } else {
          setNewCountBodega(bodegaId);
          setCountModalStep('select_category');
        }
      } else {
        // En caso de error, permitir avanzar igualmente por resiliencia
        setNewCountBodega(bodegaId);
        setCountModalStep('select_category');
      }
    } catch (error) {
      setSubmittingStart(false);
      console.log('Error checking bodega status:', error);
      // Avanzar de todas formas
      setNewCountBodega(bodegaId);
      setCountModalStep('select_category');
    }
  };

  const handleStartCount = async () => {
    if (!newCountCategory) {
      Alert.alert('Falta Categoría', 'Seleccione una categoría para el conteo.');
      return;
    }
    setSubmittingStart(true);
    try {
      const response = await fetch(`${API_URL}/bodegas/merma/stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      setSubmittingStart(false);

      if (response.ok) {
        // Filtrar todos los productos en la bodega de merma que tengan stock > 0 (sin importar la categoría)
        const items = (resData.items || []).filter(
          item => Number(item.cantidad) > 0
        );

        if (items.length > 0) {
          // Mostrar modal de autorización de descarte (ahora un paso en el mismo modal)
          setMermaItemsForDiscard(items);
          setCountModalStep('discard');
        } else {
          // No hay mermas, iniciar conteo directamente
          await proceedStartCount(false);
        }
      } else {
        // En caso de error, intentamos proceder directamente
        await proceedStartCount(false);
      }
    } catch (error) {
      setSubmittingStart(false);
      console.log('Error al verificar merma:', error);
      await proceedStartCount(false);
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
        <View style={styles.loaderLogoOuter}>
          <View style={styles.loaderLogoInner}>
            <Ionicons name="clipboard" size={40} color="#10b981" />
          </View>
        </View>
        <Text style={styles.loaderBrandText}>LICOSTOCK</Text>
        <ActivityIndicator size="small" color="#10b981" style={{ marginTop: 20, marginBottom: 10 }} />
        <Text style={styles.loaderMessageText}>Sincronizando auditoría de inventario...</Text>
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
                  setCountModalStep('select_bodega');
                  setNewCountBodega(null);
                  setMermaItemsForDiscard([]);
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
                      <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
                        Bodega: <Text style={{ fontWeight: 'bold', color: item.bodega_id === 1 ? '#3b82f6' : (item.bodega_id === 2 ? '#ef4444' : '#f59e0b') }}>
                          {item.bodega_nombre || 'Bodega Principal'}
                        </Text>
                      </Text>
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
                Bodega: <Text style={{ fontWeight: 'bold', color: activeCountDetails.header.bodega_id === 1 ? '#3b82f6' : (activeCountDetails.header.bodega_id === 2 ? '#ef4444' : '#f59e0b') }}>{activeCountDetails.header.bodega_nombre || 'Bodega Principal'}</Text>
              </Text>
              <Text style={styles.activeHeaderSub}>
                Categoría: <Text style={{ fontWeight: 'bold', color: '#10b981' }}>{activeCountDetails.header.categoria_nombre}</Text>
              </Text>
              <Text style={styles.activeHeaderSub}>
                Estado: {activeCountDetails.header.estado.toUpperCase()}
              </Text>
            </View>

            {activeCountDetails.header.estado === 'borrador' && activeCountHasMerma && (
              <View style={{ 
                marginVertical: 10, 
                padding: 12, 
                backgroundColor: 'rgba(217, 119, 6, 0.15)', 
                borderWidth: 1, 
                borderColor: '#d97706', 
                borderRadius: 8 
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="warning-outline" size={16} color="#d97706" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#d97706', fontWeight: 'bold', fontSize: 13 }}>Merma en Espera Detectada</Text>
                </View>
                <Text style={{ color: '#cbd5e1', fontSize: 11, marginBottom: 8 }}>
                  Este conteo fue iniciado dejando la merma en espera. Puedes autorizar su descarte manual general y generar el reporte en cualquier momento.
                </Text>
                <TouchableOpacity
                  style={{ 
                    backgroundColor: '#ef4444', 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    paddingVertical: 8, 
                    paddingHorizontal: 12, 
                    borderRadius: 6 
                  }}
                  onPress={handleDiscardMermaDuringCount}
                >
                  <Ionicons name="trash-outline" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>Descartar Merma Pendiente</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Resumen Monetario de Diferencias */}
            {activeCountDetails.header.estado === 'aplicado' && (
              <View style={[styles.panel, { marginTop: 10, padding: 12, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' }]}>
                <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Resumen de Ajustes de Valorización (Costo):</Text>
                {(() => {
                  let totalPerdida = 0;
                  let totalSobrante = 0;
                  activeCountDetails.items.forEach(item => {
                    const cost = parseFloat(item.costo) || 0;
                    const diff = item.diferencia || 0;
                    if (diff < 0) {
                      totalPerdida += Math.abs(diff) * cost;
                    } else if (diff > 0) {
                      totalSobrante += diff * cost;
                    }
                  });
                  const totalNeto = totalSobrante - totalPerdida;
                  return (
                    <View style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#cbd5e1', fontSize: 11 }}>Pérdidas (Faltantes):</Text>
                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700' }}>-C$${totalPerdida.toFixed(2)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#cbd5e1', fontSize: 11 }}>Sobrantes (Excesos):</Text>
                        <Text style={{ color: '#34d399', fontSize: 11, fontWeight: '700' }}>+C$${totalSobrante.toFixed(2)}</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: '#334155', marginVertical: 4 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>Efecto Neto en Inventario:</Text>
                        <Text style={{ color: totalNeto >= 0 ? '#34d399' : '#f87171', fontSize: 12, fontWeight: '800' }}>
                          {totalNeto >= 0 ? '+' : ''}C$${totalNeto.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* SECCIÓN 1: REPORTE IMPRIMIBLE (Hoja de Trabajo Físico) */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>1. Hoja de Trabajo Físico</Text>
              <TouchableOpacity 
                style={[styles.createButton, { backgroundColor: '#3b82f6', paddingVertical: 4, paddingHorizontal: 8 }]} 
                onPress={handlePrintWorksheet}
              >
                <Ionicons name="print-outline" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={[styles.createButtonText, { fontSize: 11 }]}>Imprimir Carta</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.printSheet}>
              <View style={styles.printSheetHeader}>
                <Text style={styles.printSheetTitle}>HOJA DE TRABAJO - CONTROL DE INVENTARIO</Text>
                <Text style={styles.printSheetMeta}>Licorería | Auditoría #{activeCountDetails.header.id}</Text>
                <Text style={styles.printSheetMeta}>Bodega: {activeCountDetails.header.bodega_nombre || 'Bodega Principal'}</Text>
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
            <Text style={styles.sectionTitle}>2. Transcribir Conteo Fisico al Sistema</Text>
            <View style={styles.panel}>
              {/* F13: Buscador en tiempo real */}
              <View style={[styles.searchContainer, { marginBottom: 12 }]}>
                <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { flex: 1 }]}
                  value={countSearch}
                  onChangeText={setCountSearch}
                  placeholder="Buscar producto en el conteo..."
                  placeholderTextColor="#64748b"
                />
                {countSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setCountSearch('')}>
                    <Ionicons name="close-circle" size={16} color="#64748b" />
                  </TouchableOpacity>
                )}
              </View>
              {activeCountDetails.items
                .filter(item => item.producto_nombre.toLowerCase().includes(countSearch.toLowerCase()))
                .map((item) => {

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
                          Diferencia: {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia} u. ({(() => {
                            const diffVal = item.diferencia * (Number(item.costo) || 0);
                            return diffVal >= 0 ? `+C$${diffVal.toFixed(2)}` : `-C$${Math.abs(diffVal).toFixed(2)}`;
                          })()})
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

                    {/* F14: Campo de observaciones por producto */}
                    {isBorrador && (
                      <TextInput
                        style={[styles.captureInput, { flex: 1, marginTop: 6, height: 36, fontSize: 11, textAlignVertical: 'top' }]}
                        value={observacionesValues[item.producto_id] || ''}
                        onChangeText={(val) => {
                          const updated = { ...observacionesValues };
                          updated[item.producto_id] = val;
                          setObservacionesValues(updated);
                        }}
                        placeholder="Observacion / Merma (opcional)"
                        placeholderTextColor="#475569"
                        multiline={false}
                      />
                    )}
                  </View>
                );
              })}


              {activeCountDetails.header.estado === 'borrador' ? (
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
              ) : (
                <View style={styles.countActionsRow}>
                  <TouchableOpacity 
                    style={[styles.saveDraftButton, { backgroundColor: '#3b82f6', flex: 1.1, marginRight: 8 }]} 
                    onPress={handlePrintDiffReport}
                  >
                    <Ionicons name="print-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveDraftButtonText}>Imprimir Reporte</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.applyCountButton, { backgroundColor: '#10b981', flex: 1 }]} 
                    onPress={handleExportCountExcel}
                  >
                    <Ionicons name="share-social-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.applyCountButtonText}>Exportar Excel</Text>
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

        {/* TAB: HISTORIAL DE CONTEOS */}
        {activeTab === 'historial' && (
          <>
            <View style={styles.panel}>
            <Text style={styles.panelTitle}>Historial de Conteos Aplicados</Text>

            {/* === FILTRO DE FECHAS === */}
            <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#334155' }}>
              <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Filtrar por Fecha de Aplicación</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>DESDE</Text>
                  <TextInput
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12, borderWidth: 1, borderColor: '#334155' }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#475569"
                    value={historialDesde}
                    onChangeText={v => { setHistorialDesde(v); setHistorialFechaError(''); }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>HASTA</Text>
                  <TextInput
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 6, padding: 8, fontSize: 12, borderWidth: 1, borderColor: '#334155' }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#475569"
                    value={historialHasta}
                    onChangeText={v => { setHistorialHasta(v); setHistorialFechaError(''); }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              {historialFechaError ? (
                <Text style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>{historialFechaError}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#10b981', borderRadius: 6, padding: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                  onPress={fetchHistorialConFiltro}
                >
                  <Ionicons name="search-outline" size={14} color="#fff" style={{ marginRight: 5 }} />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Filtrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#334155', borderRadius: 6, padding: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                  onPress={() => { setHistorialDesde(''); setHistorialHasta(''); setHistorialFechaError(''); fetchHistorial(); }}
                >
                  <Ionicons name="refresh-outline" size={14} color="#94a3b8" style={{ marginRight: 5 }} />
                  <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>Limpiar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Indicador de bloqueo */}
            {ventasDesdeConteo !== null && (
              <View style={[{
                borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 1,
                flexDirection: 'row', alignItems: 'center'
              },
                ventasDesdeConteo >= 5
                  ? { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }
                  : { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }
              ]}>
                <Ionicons
                  name={ventasDesdeConteo >= 5 ? 'checkmark-circle-outline' : 'lock-closed-outline'}
                  size={20}
                  color={ventasDesdeConteo >= 5 ? '#10b981' : '#f87171'}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: ventasDesdeConteo >= 5 ? '#10b981' : '#f87171', fontSize: 13, fontWeight: '700' }}>
                    {ventasDesdeConteo >= 5 ? 'Nuevo Conteo Disponible' : 'Conteo Bloqueado'}
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {ventasDesdeConteo >= 5
                      ? `Se han registrado ${ventasDesdeConteo} ventas desde el ultimo conteo. Puede iniciar uno nuevo.`
                      : `Se necesitan al menos 5 ventas desde el ultimo conteo. Ventas registradas: ${ventasDesdeConteo}.`
                    }
                  </Text>
                </View>
              </View>
            )}

            {loadingHistorial ? (
              <ActivityIndicator color="#10b981" style={{ marginVertical: 20 }} />
            ) : historialConteos.length === 0 ? (
              <Text style={styles.emptyText}>No hay conteos aplicados en el historial.</Text>
            ) : (
              historialConteos.map(c => {
                const bodegaId = c.bodega_id || 1;
                const bodegaNombre = c.bodega_nombre || 'Bodega Principal';
                const isMerma = bodegaId === 2;
                const isDebito = bodegaId === 3;
                const bodegaColor = bodegaId === 1 ? '#3b82f6' : bodegaId === 2 ? '#ef4444' : '#f59e0b';
                const tipoLabel = isMerma ? 'DESCARTE' : isDebito ? 'VERIFICACIÓN' : 'DIFERENCIAS';
                const tipoIcon = isMerma ? 'trash-outline' : isDebito ? 'shield-checkmark-outline' : 'analytics-outline';
                const precision = Number(c.precision) || 0;

                return (
                  <View key={c.id} style={[styles.countCard, { marginBottom: 12 }]}>
                    {/* Header row: ID + tipo badge + precision */}
                    <View style={styles.countCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Text style={styles.countCardTitle}>Conteo #{c.id}</Text>
                          <View style={{
                            backgroundColor: bodegaColor + '22',
                            borderColor: bodegaColor,
                            borderWidth: 1,
                            borderRadius: 6,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}>
                            <Ionicons name={tipoIcon} size={10} color={bodegaColor} style={{ marginRight: 3 }} />
                            <Text style={{ color: bodegaColor, fontSize: 9, fontWeight: '700' }}>{tipoLabel}</Text>
                          </View>
                        </View>
                        <Text style={styles.countCardCategory}>{c.categoria_nombre || 'General'}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 1 }}>
                          <Text style={{ color: bodegaColor, fontWeight: '600' }}>{bodegaNombre}</Text>
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {isMerma ? (
                          <>
                            <Ionicons name="checkmark-done-circle" size={28} color="#ef4444" />
                            <Text style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>Descartado</Text>
                          </>
                        ) : (
                          <>
                            <Text style={[
                              { fontSize: 16, fontWeight: '800' },
                              precision >= 95 ? { color: '#10b981' } :
                              precision >= 80 ? { color: '#f59e0b' } :
                              { color: '#f87171' }
                            ]}>{precision.toFixed(1)}%</Text>
                            <Text style={{ color: '#64748b', fontSize: 10 }}>Precisión</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Meta info */}
                    <View style={styles.countCardMeta}>
                      <Text style={styles.countMetaText}>
                        Aplicado: {new Date(c.fecha_aplicacion || c.fecha_aplicado || c.fecha_creacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                      <Text style={styles.countMetaText}>
                        Auditor: {c.aplicado_por || c.consultor_nombre || user.nombre}
                      </Text>
                      <Text style={styles.countMetaText}>
                        Productos: {c.total_productos || c.total_productos_contados || 0} u.
                      </Text>
                      {!isMerma && (
                        <Text style={[styles.countMetaText, {
                          color: Number(c.total_diferencias) > 0 ? '#f87171' : '#10b981',
                          fontWeight: '600'
                        }]}>
                          {Number(c.total_diferencias) > 0
                            ? `⚠ Diferencias: ${c.total_diferencias} u.`
                            : '✓ Sin diferencias'}
                        </Text>
                      )}
                      {isMerma && (
                        <Text style={[styles.countMetaText, { color: '#ef4444', fontWeight: '600' }]}>
                        ✓ Baja de inventario registrada
                        </Text>
                      )}
                      {/* Botón Ver / Reimprimir */}
                      <TouchableOpacity
                        style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e40af22', borderWidth: 1, borderColor: '#3b82f6', borderRadius: 7, padding: 9 }}
                        onPress={() => fetchHistorialDetalle(c.id)}
                      >
                        <Ionicons name="document-text-outline" size={14} color="#3b82f6" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 12 }}>Ver detalle / Reimprimir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
            <View style={{ height: 70 }} />
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* MODAL: DETALLE DEL HISTORIAL (REIMPRIMIR) */}
      <Modal
        visible={historialDetailVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => { setHistorialDetailVisible(false); setHistorialDetailData(null); }}
      >
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
          {/* Header del modal */}
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>
                {historialDetailData ? `Conteo #${historialDetailData.header.id}` : 'Detalle'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {historialDetailData ? (historialDetailData.header.bodega_nombre || 'Bodega Principal') : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={() => { setHistorialDetailVisible(false); setHistorialDetailData(null); }}>
              <Ionicons name="close-outline" size={22} color="#94a3b8" />
              <Text style={[styles.logoutText, { color: '#94a3b8' }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          {loadingHistorialDetail ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={{ color: '#94a3b8', marginTop: 12 }}>Cargando detalle...</Text>
            </View>
          ) : historialDetailData ? (
            <ScrollView style={{ flex: 1, padding: 16 }}>
              {/* Info del conteo */}
              <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#334155' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View>
                    <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>Categoría: {historialDetailData.header.categoria_nombre}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 3 }}>Bodega: {historialDetailData.header.bodega_nombre || 'Principal'}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>Fecha aplicado: {historialDetailData.header.fecha_aplicado ? new Date(historialDetailData.header.fecha_aplicado).toLocaleString('es-ES') : 'N/A'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: '#10b98122', borderColor: '#10b981', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '700' }}>APLICADO</Text>
                    </View>
                  </View>
                </View>
                {/* Botones de reimpresión */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#1e3a5f', borderWidth: 1, borderColor: '#3b82f6', borderRadius: 7, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                    onPress={() => printWorksheetFromData(historialDetailData)}
                  >
                    <Ionicons name="print-outline" size={14} color="#3b82f6" style={{ marginRight: 5 }} />
                    <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 11 }}>Hoja de Trabajo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#a855f7', borderRadius: 7, padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                    onPress={() => printDiffReportFromData(historialDetailData)}
                  >
                    <Ionicons name="analytics-outline" size={14} color="#a855f7" style={{ marginRight: 5 }} />
                    <Text style={{ color: '#a855f7', fontWeight: '700', fontSize: 11 }}>Inf. Diferencias</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tabla de productos */}
              <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Detalle de Productos ({historialDetailData.items.length})</Text>
              {historialDetailData.items.map((item, idx) => {
                const diff = Number(item.diferencia) || 0;
                const diffColor = diff < 0 ? '#f87171' : diff > 0 ? '#34d399' : '#64748b';
                return (
                  <View key={item.id} style={{ backgroundColor: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: diffColor }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: '#f8fafc', fontWeight: '600', fontSize: 13 }}>{item.producto_nombre}</Text>
                        <Text style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>Ref #{item.producto_id}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {diff !== 0 ? (
                          <Text style={{ color: diffColor, fontWeight: '800', fontSize: 14 }}>{diff > 0 ? '+' : ''}{diff} u.</Text>
                        ) : (
                          <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', marginTop: 6, gap: 16 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 11 }}>Sistema: <Text style={{ color: '#cbd5e1', fontWeight: '600' }}>{item.cantidad_sistema} u.</Text></Text>
                      <Text style={{ color: '#94a3b8', fontSize: 11 }}>Contado: <Text style={{ color: '#cbd5e1', fontWeight: '600' }}>{item.cantidad_contada ?? '—'} u.</Text></Text>
                    </View>
                    {item.observaciones ? <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>Obs: {item.observaciones}</Text> : null}
                  </View>
                );
              })}
              <View style={{ height: 60 }} />
            </ScrollView>
          ) : null}
        </View>
      </Modal>

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
          style={[styles.tabBarButton, activeTab === 'historial' && styles.tabBarButtonActive]}
          onPress={() => setActiveTab('historial')}
        >
          <Ionicons
            name={activeTab === 'historial' ? 'time' : 'time-outline'}
            size={20}
            color={activeTab === 'historial' ? '#10b981' : '#94a3b8'}
          />
          <Text style={[styles.tabBarText, activeTab === 'historial' && styles.tabBarTextActive]}>Historial</Text>
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


      {/* MODAL INICIAR NUEVA AUDITORÍA CON PASOS INTEGRADAS */}
      <Modal
        visible={showNewCountModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowNewCountModal(false);
          setCountModalStep('select_bodega');
          setNewCountBodega(null);
          setMermaItemsForDiscard([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, countModalStep === 'discard' && { height: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {countModalStep === 'discard' ? 'Autorizar Descarte de Merma' : 
                 (countModalStep === 'select_category' ? 'Seleccionar Categoría' : 'Seleccionar Bodega')}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowNewCountModal(false);
                setCountModalStep('select_bodega');
                setNewCountBodega(null);
                setMermaItemsForDiscard([]);
              }}>
                <Ionicons name="close-outline" size={24} color="#f8fafc" />
              </TouchableOpacity>
            </View>

            {countModalStep === 'discard' ? (
              // PASO 3: AUTORIZAR DESCARTE DE MERMA
              <>
                <View style={{ padding: 16, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderBottomWidth: 1, borderColor: '#ef4444' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name="warning-outline" size={20} color="#ef4444" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 14 }}>BAJA DE INVENTARIO REQUERIDA</Text>
                  </View>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                    Para poder iniciar la auditoría física de esta categoría, es obligatorio autorizar el descarte y salida del sistema de los siguientes artículos registrados en la Bodega de Merma. Se generará un comprobante de descarte oficial.
                  </Text>
                </View>

                <ScrollView style={{ flex: 1, padding: 16 }}>
                  <Text style={[styles.formLabel, { marginBottom: 10 }]}>Licores a Descartar (Stock Merma):</Text>
                  
                  {mermaItemsForDiscard.map((item) => {
                    const qty = Number(item.cantidad) || 0;
                    const cost = Number(item.costo) || 0;
                    const total = qty * cost;
                    return (
                      <View 
                        key={item.id} 
                        style={{ 
                          flexDirection: 'row', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          backgroundColor: '#1e293b', 
                          padding: 12, 
                          borderRadius: 8, 
                          marginBottom: 8, 
                          borderWidth: 1, 
                          borderColor: '#334155' 
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: '700' }}>{item.nombre}</Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Costo unitario: C$${cost.toFixed(2)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '700' }}>{qty} u.</Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>C$${total.toFixed(2)}</Text>
                        </View>
                      </View>
                    );
                  })}

                  <View style={{ backgroundColor: '#0f172a', padding: 12, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: '#ef4444', borderStyle: 'dashed', marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 12 }}>Unidades Totales:</Text>
                      <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: 'bold' }}>
                        {mermaItemsForDiscard.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0)} u.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#94a3b8', fontSize: 12 }}>Impacto Financiero Total:</Text>
                      <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: 'bold' }}>
                        C$${mermaItemsForDiscard.reduce((acc, curr) => acc + ((Number(curr.cantidad) || 0) * (Number(curr.costo) || 0)), 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' }}>
                  <TouchableOpacity
                    style={{ 
                      backgroundColor: '#ef4444', 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: 12, 
                      borderRadius: 8,
                      marginBottom: 8
                    }}
                    onPress={async () => {
                      // 1. Imprimir reporte de descarte
                      await handlePrintMermaDiscardReport(mermaItemsForDiscard);
                      // 2. Iniciar conteo (el backend procesará el descarte)
                      await proceedStartCount(true);
                    }}
                    disabled={submittingStart}
                  >
                    {submittingStart ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Autorizar Descarte de Merma e Iniciar</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ 
                      backgroundColor: '#d97706', 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: 12, 
                      borderRadius: 8,
                      marginBottom: 8
                    }}
                    onPress={async () => {
                      // Iniciar conteo sin descartar (dejar en espera)
                      await proceedStartCount(false);
                    }}
                    disabled={submittingStart}
                  >
                    {submittingStart ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="time-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>Dejar en Espera (Proceder sin descartar)</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ 
                      backgroundColor: 'transparent', 
                      borderWidth: 1, 
                      borderColor: '#475569', 
                      padding: 12, 
                      borderRadius: 8, 
                      alignItems: 'center' 
                    }}
                    onPress={() => {
                      setCountModalStep('select_category');
                      setMermaItemsForDiscard([]);
                    }}
                    disabled={submittingStart}
                  >
                    <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 13 }}>Volver a Selección de Categoría</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : countModalStep === 'select_category' ? (
              // PASO 2: SELECCIONAR CATEGORÍA
              <ScrollView>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    Bodega Seleccionada: <Text style={{ fontWeight: 'bold', color: newCountBodega === 1 ? '#3b82f6' : (newCountBodega === 2 ? '#ef4444' : '#f59e0b') }}>
                      {newCountBodega === 1 ? 'Bodega Principal' : (newCountBodega === 2 ? 'Bodega de Merma' : 'Bodega de Débito')}
                    </Text>
                  </Text>
                  <View style={{ height: 10 }} />
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

                <TouchableOpacity
                  style={{ 
                    backgroundColor: 'transparent', 
                    borderWidth: 1, 
                    borderColor: '#475569', 
                    padding: 12, 
                    borderRadius: 8, 
                    alignItems: 'center',
                    marginTop: 10,
                    marginBottom: 20
                  }}
                  onPress={() => {
                    setCountModalStep('select_bodega');
                    setNewCountBodega(null);
                  }}
                >
                  <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 13 }}>Volver a Selección de Bodega</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              // PASO 1: SELECCIONAR BODEGA
              <ScrollView>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Seleccione Bodega a Auditar:</Text>
                  <View style={{ flexDirection: 'column', gap: 10, marginTop: 10, paddingBottom: 20 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#1e293b',
                        borderWidth: 2,
                        borderColor: '#3b82f6',
                        padding: 16,
                        borderRadius: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onPress={() => handleSelectBodega(1)}
                    >
                      <View>
                        <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>Bodega Principal</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Determinar diferencias físicas</Text>
                      </View>
                      <Ionicons name="chevron-forward-outline" size={20} color="#3b82f6" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        backgroundColor: '#1e293b',
                        borderWidth: 2,
                        borderColor: '#ef4444',
                        padding: 16,
                        borderRadius: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onPress={() => handleSelectBodega(2)}
                    >
                      <View>
                        <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>Bodega de Merma</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Productos dañados y descarte</Text>
                      </View>
                      <Ionicons name="chevron-forward-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        backgroundColor: '#1e293b',
                        borderWidth: 2,
                        borderColor: '#f59e0b',
                        padding: 16,
                        borderRadius: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onPress={() => handleSelectBodega(3)}
                    >
                      <View>
                        <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>Bodega de Débito</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Verificar que todo esté correcto</Text>
                      </View>
                      <Ionicons name="chevron-forward-outline" size={20} color="#f59e0b" />
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
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
                ADVERTENCIA: Esta accion actualizara de forma definitiva las existencias en produccion.
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
    borderColor: 'rgba(16, 185, 129, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    marginBottom: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3
  },
  loaderLogoInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  searchInput: {
    color: '#f8fafc',
    fontSize: 14,
    paddingVertical: 0
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

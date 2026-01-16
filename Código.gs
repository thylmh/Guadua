/***** CONFIGURACIÓN *****/
function getAppSheetConfig_() {
  const p = PropertiesService.getScriptProperties();
  const hostRaw = p.getProperty("APPSHEET_HOST") || "https://api.appsheet.com";
  const host = hostRaw.startsWith("http") ? hostRaw : `https://${hostRaw}`;
  const appId = p.getProperty("APPSHEET_APP_ID");
  const key = p.getProperty("APPSHEET_ACCESS_KEY");

  if (!appId || !key) {
    throw new Error("Faltan Script Properties: APPSHEET_APP_ID y/o APPSHEET_ACCESS_KEY");
  }
  return { host, appId, key };
}

const CONFIG = {
  TABLES: {
    EMPLEADOS: "Activos",
    FINANCIACION: "BDFinanciamiento",
    CONTRATOS: "Contratos Activos"
  },
  COLS: {
    EMP: {
      CEDULA: "Cédula",
      NOMBRE: "Name",
      CORREO: "correo electrónico",
      SALARIO: "Salario"
    },
    FIN: {
      ID: "IDFinanciacion",
      CONTRATO: "Contrato",
      POSICION: "Posicion",
      CEDULA: "Cédula",
      START: "Start_Date",
      END: "End_Date",
      SALARIO_EDITABLE: "Salario",
      SALARIO_CALCULADO: "Salario_Total",
      FDEC: "FDEC",
      RUBRO: "Rubro",
      PROY: "IdProyectos",
      FUENTE: "IdFuente",
      COMPONENTE: "IdComponente",
      SUBCOMPONENTE: "IdSubcomponente",
      CATEGORIA: "IdCategoria",
      RESPONSABLE: "IdResponsable",
      MODIFICO: "Modifico",
      FECHA_MOD: "Fecha Modificacion"
    },
    CON: {
      IDCONTRATO: "IDCONTRATO",
      POSICION: "Posicion",
      CEDULA: "Cédula",
      FAMILIA: "Familia",
      CARGO: "Cargo",
      ROL: "Rol",
      BANDA: "Banda",
      SALARIO: "Salario",
      NIVEL_RIESGO: "Nivel de Riesgo",
      ATEP: "Atep",
      DIRECCION: "Dirección",
      GERENCIA: "Gerencia",
      AREA: "Área",
      SUBAREA: "Subárea",
      PLANTA: "Planta",
      TPLANTA: "TPlanta",
      TIPO_CONTRATO: "Tipo de contrato",
      NUM_CONTRATO: "N° contrato",
      F_CONTRATO: "F_Contrato",
      NUM_OTROSI: "N° de otrosi a la fecha",
      PRORROGAS: "Prórrogas a la fecha",
      F_INGRESO: "F. Ingreso",
      F_TERMINACION: "F. Terminación Contrato",
      MODALIDAD_TT: "Modalidad Teletrabajo",
      DIAS_TT: "Total días teletrabajo",
      SEDE: "Sede",
      CIUDAD: "ciudad de contratación",
      ESTADO: "Estado",
      METODO_SELECCION: "Método de selección",
      ENCARGO: "Encargo",
      MOTIVO_INGRESO: "Motivo del ingreso",
      FECHA_TERMI: "Fecha_Termi",
      CAUSAL_RETIRO: "Causal de retiro",
      USUARIO: "Usuario",
      MODIFICACION: "Modificacion"
    }
  }
};

/***** WEB APP *****/
function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Guadua - Planeación de Nómina")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/***** APPSHEET API *****/
function appsheetPost_(tableName, action, rows = [], properties = {}) {
  const config = getAppSheetConfig_();
  const host = config.host;
  const appId = config.appId;
  const key = config.key;
  const url = `${host}/api/v2/apps/${appId}/tables/${encodeURIComponent(tableName)}/Action`;
  
  const payload = { Action: action, Properties: properties, Rows: rows };
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "ApplicationAccessKey": key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const res = UrlFetchApp.fetch(url, options);
  const statusCode = res.getResponseCode();
  const responseText = res.getContentText();
  
  if (statusCode !== 200) {
    throw new Error(`Error API (${statusCode}): ${responseText || 'Sin respuesta'}`);
  }
  if (!responseText) {
    throw new Error("La API no devolvió datos");
  }

  const data = JSON.parse(responseText);
  return Array.isArray(data) ? data : (data?.Rows || []);
}

/***** HELPERS (REUSABLES, NO CAMBIAN FUNCIONALIDAD) *****/
function makeIdMap_(rows, idKey) {
  const m = {};
  (rows || []).forEach(r => {
    const k = r?.[idKey];
    if (k !== null && k !== undefined && k !== "") m[String(k)] = r;
  });
  return m;
}

function csvEsc_(v) {
  if (v === null || v === undefined) v = "";
  v = String(v);
  if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function buildCatMaps_() {
  const cats = getCatalogosFinanciacion(); // tu función existente
  function toMap(list) {
    const m = {};
    (list || []).forEach(it => { if (it && it.id != null) m[String(it.id)] = String(it.nombre || ""); });
    return m;
  }
  return {
    proyectos:      toMap(cats.proyectos),
    fuentes:        toMap(cats.fuentes),
    componentes:    toMap(cats.componentes),
    subcomponentes: toMap(cats.subcomponentes),
    categorias:     toMap(cats.categorias),
    responsables:   toMap(cats.responsables)
  };
}

function codeName_(catMap, listName, id) {
  if (id === null || id === undefined || id === "") return "";
  const key = String(id);
  const nombre = (catMap[listName] && catMap[listName][key]) ? catMap[listName][key] : "";
  return nombre ? (key + " | " + nombre) : key;
}


function cacheGetJSON_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function cachePutJSON_(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds);
  } catch (e) {
    // si falla cache, no rompemos nada
  }
}

function find_(tableName, selector) {
  const props = selector ? { Selector: selector } : {};
  return appsheetPost_(tableName, "Find", [], props) || [];
}

function getMensualizadosGlobalCached_(seconds) {
  const cacheKey = "MENSUALIZADOS_GLOBAL_V2";
  const cached = cacheGetJSON_(cacheKey);
  if (cached) return cached;

  const { TABLES, COLS } = CONFIG;

  const tramos = appsheetPost_(TABLES.FINANCIACION, "Find", [], {}) || [];
  const mensualizados = mensualizarBase30(tramos);

  // ✅ mapa mínimo (para getResumenMesGlobal): id -> cedula
  const idToCedula = {};
  tramos.forEach(t => {
    const id = t[COLS.FIN.ID];
    const ced = t[COLS.FIN.CEDULA];
    if (id != null && id !== "") idToCedula[String(id)] = String(ced || "");
  });

  const payload = { mensualizados, idToCedula };

  cachePutJSON_(cacheKey, payload, seconds || 600);
  return payload;
}


function invalidateGlobalCache_() {
  try {
    const c = CacheService.getScriptCache();
    c.remove("MENSUALIZADOS_GLOBAL_V2");
    c.remove("DASHBOARD_GLOBAL_V1");
  } catch (e) {}
}

function getMesMensualizadoCached_(anioMes, seconds) {
  const key = "MES_MENSUALIZADO_" + String(anioMes);
  const cached = cacheGetJSON_(key);
  if (cached) return cached;

  // Si no está, calculamos desde tramos (una vez) y buscamos el mes
  const { TABLES } = CONFIG;
  const tramos = appsheetPost_(TABLES.FINANCIACION, "Find", [], {}) || [];
  const mensualizados = mensualizarBase30(tramos);
  const mes = mensualizados.find(m => m.anioMes === anioMes) || null;

  cachePutJSON_(key, mes, seconds || 600);
  return mes;
}



/***** LÓGICA DE NEGOCIO *****/
function getVistaFinanciacion(params) {
  try {
    const { cedula = "" } = params || {};
    const { TABLES, COLS } = CONFIG;

    if (!cedula.trim()) return { ok: false, message: "Debe proporcionar una cédula válida." };

    // 1. Trabajador
    const selectorEmp = `Filter("${TABLES.EMPLEADOS}", [${COLS.EMP.CEDULA}] = "${cedula.trim()}")`;
    const resEmp = find_(TABLES.EMPLEADOS, selectorEmp);
    if (!resEmp || resEmp.length === 0) return { ok: false, message: "No se encontró el trabajador con esa cédula." };
    const emp = resEmp[0];

    // 2. Contrato
    const selectorCon = `Filter("${TABLES.CONTRATOS}", [${COLS.CON.CEDULA}] = "${emp[COLS.EMP.CEDULA]}")`;
    const contratosRaw = find_(TABLES.CONTRATOS, selectorCon);
    
    let contratoData = null;
    let datosVista = null;

    if (contratosRaw.length > 0) {
      const activo = contratosRaw.find(c => String(c["Estado"] || "").toLowerCase().includes("activo"));
      const c = activo || contratosRaw[0];

      contratoData = c;

      if (contratoData) {
        datosVista = {
          CEDULA:        emp[COLS.EMP.CEDULA],
          IDCONTRATO:    contratoData[COLS.CON.IDCONTRATO],
          POSICION:      contratoData[COLS.CON.POSICION],
          NOMBRE:        emp[COLS.EMP.NOMBRE],
          CARGO:         contratoData[COLS.CON.CARGO],
          ROL:           contratoData[COLS.CON.ROL],
          BANDA:         contratoData[COLS.CON.BANDA],
          SALARIO:       contratoData[COLS.CON.SALARIO],
          NIVEL_RIESGO:  contratoData[COLS.CON.NIVEL_RIESGO],
          ATEP:          contratoData[COLS.CON.ATEP],
          DIRECCION:     contratoData[COLS.CON.DIRECCION],
          GERENCIA:      contratoData[COLS.CON.GERENCIA],
          AREA:          contratoData[COLS.CON.AREA],
          SUBAREA:       contratoData[COLS.CON.SUBAREA],
          PLANTA:        contratoData[COLS.CON.PLANTA],
          TPLANTA:       contratoData[COLS.CON.TPLANTA],
          NUM_CONTRATO:  contratoData[COLS.CON.NUM_CONTRATO],
          F_CONTRATO:    contratoData[COLS.CON.F_INGRESO] || contratoData["Fecha Inicio"], 
          F_TERMINACION: contratoData[COLS.CON.F_TERMINACION],
          PRORROGAS:     contratoData[COLS.CON.PRORROGAS]
        };
      }
    }

    // 3. Tramos
    const selectorFin = `Filter("${TABLES.FINANCIACION}", [${COLS.FIN.CEDULA}] = "${emp[COLS.EMP.CEDULA]}")`;
    const tramosRaw = find_(TABLES.FINANCIACION, selectorFin);

    const tramosMapeados = tramosRaw.map(t => ({
      id: t[COLS.FIN.ID],
      contrato: t[COLS.FIN.CONTRATO],
      posicion: t[COLS.FIN.POSICION],
      fechaInicio: t[COLS.FIN.START],
      fechaFin: t[COLS.FIN.END],
      salarioEditable: Number(t[COLS.FIN.SALARIO_EDITABLE]) || 0,
      salarioCalculado: Number(t[COLS.FIN.SALARIO_CALCULADO]) || 0,
      rubro: t[COLS.FIN.RUBRO] || "",
      proyecto: t[COLS.FIN.PROY],
      fuente: t[COLS.FIN.FUENTE],
      componente: t[COLS.FIN.COMPONENTE],
      subcomponente: t[COLS.FIN.SUBCOMPONENTE],
      categoria:t[COLS.FIN.CATEGORIA],
      responsable: t[COLS.FIN.RESPONSABLE]
    }));

    return {
      ok: true,
      empleado: { cedula: emp[COLS.EMP.CEDULA], nombre: emp[COLS.EMP.NOMBRE], correo: emp[COLS.EMP.CORREO] },
      cabecera: datosVista,
      tramos: tramosMapeados,
      months: mensualizarBase30(tramosRaw)
    };
  } catch (e) {
    return { ok: false, message: "Error en servidor: " + e.toString() };
  }
}

function mensualizarBase30(tramos) {
  const acc = new Map();
  const { FIN } = CONFIG.COLS;
  const monthStart = (d) => new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);

  tramos.forEach(t => {
    if (!t[FIN.START] || !t[FIN.END]) return;

    const ini = new Date(t[FIN.START]);
    const fin = new Date(t[FIN.END]);
    const salarioParaCalculo = Number(t[FIN.SALARIO_CALCULADO]) || 0;

    let cur = monthStart(ini);
    const last = monthStart(fin);

    while (cur <= last) {
      const isStartMonth = cur.getUTCFullYear() === ini.getUTCFullYear() && cur.getUTCMonth() === ini.getUTCMonth();
      const isEndMonth = cur.getUTCFullYear() === fin.getUTCFullYear() && cur.getUTCMonth() === fin.getUTCMonth();
      
      let dias = 30;
      if (isStartMonth) dias = 30 - ini.getUTCDate() + 1;
      if (isEndMonth) dias = Math.min(dias, fin.getUTCDate());
      if (dias < 0) dias = 0;

      const valorMes = Math.round(salarioParaCalculo * (dias / 30));
      const key = Utilities.formatDate(cur, "UTC", "yyyy-MM-01");

      if (!acc.has(key)) acc.set(key, { anioMes: key, total: 0, detalle: [] });
      const m = acc.get(key);
      m.total += valorMes;
      
      m.detalle.push({
        id: t[FIN.ID], 
        contrato: t[FIN.CONTRATO], 
        proyecto: t[FIN.PROY], 
        rubro: t[FIN.RUBRO] || "", 
        fuente: t[FIN.FUENTE],
        componente: t[FIN.COMPONENTE], 
        subcomponente: t[FIN.SUBCOMPONENTE],
        categoria: t[FIN.CATEGORIA],
        responsable: t[FIN.RESPONSABLE], 
        valor: valorMes, 
        dias: dias, 
        salarioMensual: salarioParaCalculo
      });
      
      cur = new Date(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1);
    }
  });
  return Array.from(acc.values()).sort((a, b) => a.anioMes.localeCompare(b.anioMes));
}

/***** CATÁLOGOS *****/
function getCatalogoDim_(tableName, colId = "CODIGO", colNombre = "NOMBRE") {
  const rows = appsheetPost_(tableName, "Find", [], {}) || [];
  
  if (rows.length > 0) {
    console.log(`[CATALOGO ${tableName}] Columnas encontradas: ${Object.keys(rows[0]).join(", ")}`);
  } else {
    console.warn(`[CATALOGO ${tableName}] No devolvió filas.`);
    return [];
  }

  return rows
    .map(r => ({ 
      id: r[colId],
      nombre: r[colNombre]
    }))
    .filter(x => x.id !== "" && x.id != null && x.id !== undefined);
}

function getCatalogosFinanciacion() {
  const cacheKey = "CATALOGOS_FINANCIACION_V1";
  const cached = cacheGetJSON_(cacheKey);
  if (cached) return cached;

  const data = {
    proyectos:      getCatalogoDim_("DimProyectos",     "CODIGO", "NOMBRE"),
    fuentes:        getCatalogoDim_("DimFuente",        "CODIGO", "NOMBRE"),
    componentes:    getCatalogoDim_("DimComponente",    "CODIGO", "NOMBRE"),
    subcomponentes: getCatalogoDim_("DimSubcomponente", "CODIGO", "NOMBRE"),
    categorias:     getCatalogoDim_("DimCategoria",     "CODIGO", "NOMBRE"),
    responsables:   getCatalogoDim_("DimResponsable",   "CODIGO", "NOMBRE")
  };

  // 30 minutos (1800s). Puedes bajar a 600 si cambia mucho.
  cachePutJSON_(cacheKey, data, 1800);
  return data;
}


function getCurrentUser_() {
  const email = Session.getActiveUser().getEmail() || 
                Session.getEffectiveUser().getEmail();
  return email || "Usuario Web Desconocido";
}

function getTimestamp_() {
  return Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss"); 
}

function guardarTramoFinanciacion(datos) {
  try {
    const { TABLES, COLS } = CONFIG;
    const { FIN } = COLS;

    const userEmail = getCurrentUser_();
    const timeNow = getTimestamp_();

    const row = {};
    const isEdit = !!datos.id;

    if (isEdit) row[FIN.ID] = datos.id;

    row[FIN.CEDULA] = datos.cedula;
    row[FIN.CONTRATO] = datos.contrato || "";
    row[FIN.POSICION] = datos.posicion || "";
    row[FIN.START] = datos.fechaInicio;
    row[FIN.END] = datos.fechaFin;
    row[FIN.SALARIO_EDITABLE] = Number(datos.salario) || 0;

    row[FIN.PROY] = datos.proyecto;
    row[FIN.RUBRO] = datos.rubro;
    row[FIN.FUENTE] = datos.fuente;
    row[FIN.COMPONENTE] = datos.componente;
    row[FIN.SUBCOMPONENTE] = datos.subcomponente;
    row[FIN.CATEGORIA] = datos.categoria;
    row[FIN.RESPONSABLE] = datos.responsable;

    row[FIN.MODIFICO] = userEmail;
    row[FIN.FECHA_MOD] = timeNow;

    appsheetPost_(TABLES.FINANCIACION, isEdit ? "Edit" : "Add", [row]);

    // ✅ invalidar global cache tras cambios
    invalidateGlobalCache_();

    return { ok: true, message: isEdit ? "Tramo actualizado correctamente" : "Tramo creado correctamente" };
  } catch (e) {
    console.error("Error guardarTramo:", e);
    return { ok: false, message: "Error al guardar: " + e.toString() };
  }
}


function eliminarTramoFinanciacion(id) {
  try {
    const { TABLES, COLS } = CONFIG;

    const row = {};
    row[COLS.FIN.ID] = id;
    row[COLS.FIN.MODIFICO] = getCurrentUser_();

    appsheetPost_(TABLES.FINANCIACION, "Delete", [row]);

    // ✅ Invalida cache SOLO si el delete fue exitoso
    invalidateGlobalCache_();

    return { ok: true, message: "Tramo eliminado" };
  } catch (e) {
    return { ok: false, message: e.toString() };
  }
}


function getLoggedUser() {
  return { email: Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() };
}

/***** DASHBOARD GLOBAL *****/
function getDashboardGlobal() {
  try {
    const cacheKey = "DASHBOARD_GLOBAL_V1";
    const cached = cacheGetJSON_(cacheKey);
    if (cached) return cached;

    const { TABLES, COLS } = CONFIG;
    
    // 1. Obtener catálogo de proyectos para mapear nombres
    const catalogoProyectos = getCatalogoDim_("DimProyectos", "CODIGO", "NOMBRE");
    const mapProyectos = {};
    catalogoProyectos.forEach(p => {
      mapProyectos[p.id] = p.nombre;
    });
    
    // 2. Obtener TODOS los empleados para mapear nombres
    const todosEmpleados = appsheetPost_(TABLES.EMPLEADOS, "Find", [], {});
    const mapEmpleados = {};
    todosEmpleados.forEach(emp => {
      mapEmpleados[emp[COLS.EMP.CEDULA]] = emp[COLS.EMP.NOMBRE];
    });
    
    // 2b. Obtener contratos para mapear Dirección y Gerencia
    const todosContratos = appsheetPost_(TABLES.CONTRATOS, "Find", [], {});
    const mapDireccionGerencia = {};
    todosContratos.forEach(con => {
      const cedula = con[COLS.CON.CEDULA];
      if (cedula && con["Estado"] && String(con["Estado"]).toLowerCase().includes("activo")) {
        mapDireccionGerencia[cedula] = {
          direccion: con[COLS.CON.DIRECCION] || "Sin Dirección",
          gerencia: con[COLS.CON.GERENCIA] || "Sin Gerencia",
          fTerminacion: con[COLS.CON.F_TERMINACION] || "",
          prorrogas: con[COLS.CON.PRORROGAS] || 0
        };
      }
    });
    
    // 3. Crear mapa de tramos por ID para búsqueda rápida
    const todosLosTramos = appsheetPost_(TABLES.FINANCIACION, "Find", [], {});
    
    if (!todosLosTramos || todosLosTramos.length === 0) {
      return { ok: false, message: "No hay datos de financiación disponibles" };
    }

    const mapTramos = {};
    todosLosTramos.forEach(t => {
      mapTramos[t[COLS.FIN.ID]] = t;
    });

    // 4. Mensualizar todos los tramos
    const todosMensualizados = mensualizarBase30(todosLosTramos);
    
    // 5. Agrupar por Proyecto y Mes (tabla consolidada original)
    const proyectosPorMes = {};
    const proyectosSet = new Set();
    const cedulasUnicas = new Set();
    
    // 6. NUEVA ESTRUCTURA: Proyecto > Empleado > Mes
    const proyectoEmpleadoMes = {};
    
    todosMensualizados.forEach(mes => {
      mes.detalle.forEach(d => {
        const codigoProyecto = d.proyecto;
        const nombreProyecto = mapProyectos[codigoProyecto] || codigoProyecto;
        const tramoOriginal = mapTramos[d.id];
        const cedula = tramoOriginal ? tramoOriginal[COLS.FIN.CEDULA] : null;
        const nombreEmpleado = cedula ? (mapEmpleados[cedula] || cedula) : "Sin nombre";
        
        proyectosSet.add(nombreProyecto);
        
        // Tabla consolidada original (Proyecto vs Mes)
        if (!proyectosPorMes[nombreProyecto]) {
          proyectosPorMes[nombreProyecto] = {};
        }
        if (!proyectosPorMes[nombreProyecto][mes.anioMes]) {
          proyectosPorMes[nombreProyecto][mes.anioMes] = 0;
        }
        proyectosPorMes[nombreProyecto][mes.anioMes] += d.valor || 0;
        
        // NUEVA ESTRUCTURA: Proyecto > Empleado > Mes
        if (!proyectoEmpleadoMes[nombreProyecto]) {
          proyectoEmpleadoMes[nombreProyecto] = {};
        }
        if (!proyectoEmpleadoMes[nombreProyecto][nombreEmpleado]) {
          const infoContrato = cedula ? mapDireccionGerencia[cedula] : null;
          proyectoEmpleadoMes[nombreProyecto][nombreEmpleado] = {
            cedula: cedula,
            direccion: infoContrato ? infoContrato.direccion : "Sin Dirección",
            gerencia: infoContrato ? infoContrato.gerencia : "Sin Gerencia",
            fTerminacion: infoContrato ? infoContrato.fTerminacion : "",
            prorrogas: infoContrato ? infoContrato.prorrogas : 0,
            meses: {}
          };
        }
        if (!proyectoEmpleadoMes[nombreProyecto][nombreEmpleado].meses[mes.anioMes]) {
          proyectoEmpleadoMes[nombreProyecto][nombreEmpleado].meses[mes.anioMes] = 0;
        }
        proyectoEmpleadoMes[nombreProyecto][nombreEmpleado].meses[mes.anioMes] += d.valor || 0;
      });
    });
    
    // 7. Contar CÉDULAS ÚNICAS
    todosLosTramos.forEach(t => {
      const cedula = t[COLS.FIN.CEDULA];
      if (cedula) cedulasUnicas.add(String(cedula).trim());
    });
    
    // 8. Calcular totales
    let totalGeneral = 0;
    todosMensualizados.forEach(m => totalGeneral += m.total);
    
    const proyectos = Array.from(proyectosSet).sort();
    
    const payload = {
      ok: true,
      data: {
        proyectosPorMes: proyectosPorMes,
        proyectoEmpleadoMes: proyectoEmpleadoMes, // NUEVA ESTRUCTURA
        proyectos: proyectos,
        totales: {
          totalGeneral: totalGeneral,
          cantidadEmpleados: cedulasUnicas.size,
          meses: todosMensualizados.length
        }
      }
    };
    cachePutJSON_(cacheKey, payload, 300);
    return payload;
    
  } catch (e) {
    Logger.log("Error getDashboardGlobal: " + e.toString());
    return { ok: false, message: "Error al generar dashboard global: " + e.toString() };
  }
}


function getMensualizadoGlobal() {
  try {
    const cached = getMensualizadosGlobalCached_(600);
    return { ok: true, data: cached.mensualizados };
  } catch (e) {
    return { ok: false, message: "Error: " + e.toString() };
  }
}



function exportMensualizadoCSV() {
  try {
    const { TABLES, COLS } = CONFIG;

    // 1) Traer todos los tramos
    const todosTramos = appsheetPost_(TABLES.FINANCIACION, "Find", [], {}) || [];
    if (!todosTramos.length) return { ok: false, message: "No hay datos" };

    // 2) Mensualizar
    const mensualizados = mensualizarBase30(todosTramos);

    // 3) Mapa por ID para recuperar cédula/fechas/posición
    const byId = makeIdMap_(todosTramos, COLS.FIN.ID);

    // 4) Catálogos para "CODIGO | NOMBRE"
    const catMap = buildCatMaps_();

    // 5) Header (lo dejas como tú lo quieres)
    const header = [
      "cedula",
      "tramoInicio",
      "tramoFin",
      "mes",
      "diasMes",
      "valorMes",
      "salarioMensual",
      "idTramo",
      "contrato",
      "posicion",
      "proyecto",
      "rubro",
      "fuente",
      "componente",
      "subcomponente",
      "categoria",
      "responsable"
    ];

    const lines = [header.join(",")];

    // 6) Filas
    mensualizados.forEach(m => {
      const mesClave = m.anioMes; // "yyyy-MM-01"
      (m.detalle || []).forEach(d => {
        const t = byId[String(d.id)] || {};
        const row = [
          t[COLS.FIN.CEDULA] || "",
          t[COLS.FIN.START] || "",
          t[COLS.FIN.END] || "",
          mesClave,
          d.dias || 0,
          d.valor || 0,
          d.salarioMensual || 0,
          d.id || "",
          d.contrato || "",
          t[COLS.FIN.POSICION] || "",

          // ✅ ORDEN CORRECTO (proyecto luego rubro)
          codeName_(catMap, "proyectos", d.proyecto),
          d.rubro || "",
          codeName_(catMap, "fuentes", d.fuente),
          codeName_(catMap, "componentes", d.componente),
          codeName_(catMap, "subcomponentes", d.subcomponente),
          codeName_(catMap, "categorias", d.categoria),
          codeName_(catMap, "responsables", d.responsable)
        ].map(csvEsc_).join(",");

        lines.push(row);
      });
    });

    // ✅ Excel-friendly: BOM + CRLF (tildes OK)
    const csv = "\uFEFF" + lines.join("\r\n");

    const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    return { ok: true, url: dataUri };

  } catch (e) {
    return { ok: false, message: "Error exportando CSV: " + e.toString() };
  }
}


function getResumenMesGlobal(anioMes) {
  try {
    if (!anioMes || String(anioMes).trim() === "") {
      return { ok: false, message: "Debe proporcionar un mes válido (yyyy-MM-01)." };
    }

    // 1) Mes (total + detalle) cacheado por mes
    const mes = getMesMensualizadoCached_(anioMes, 600);
    if (!mes) return { ok: false, message: "Mes no encontrado: " + anioMes };

    // 2) id->cedula global (liviano)
    const cached = getMensualizadosGlobalCached_(600); // V2 que retorna { idToCedula, mensualizados? }
    const idToCedula = cached.idToCedula || {};

    // 3) Proyectos (catálogo cacheado)
    const cats = getCatalogosFinanciacion();
    const mapProyectos = {};
    (cats.proyectos || []).forEach(p => {
      if (p && p.id != null) mapProyectos[String(p.id)] = String(p.nombre || "");
    });

    // 4) Resumen
    const porProyecto = {};

    (mes.detalle || []).forEach(d => {
      const proyId = (d.proyecto == null || d.proyecto === "") ? "SIN_PROY" : String(d.proyecto);

      if (!porProyecto[proyId]) {
        porProyecto[proyId] = {
          proyectoId: proyId,
          proyectoNombre: mapProyectos[proyId] || proyId,
          total: 0,
          tramos: new Set(),
          cedulas: new Set()
        };
      }

      porProyecto[proyId].total += Number(d.valor || 0) || 0;

      if (d.id != null && d.id !== "") {
        const tramoId = String(d.id);
        porProyecto[proyId].tramos.add(tramoId);
        const cedula = idToCedula[tramoId] || "";
        if (cedula) porProyecto[proyId].cedulas.add(String(cedula).trim());
      }
    });

    const proyectos = Object.values(porProyecto)
      .map(p => ({
        proyectoId: p.proyectoId,
        proyectoNombre: p.proyectoNombre,
        total: p.total,
        cantidadTramos: p.tramos.size,
        cantidadEmpleados: p.cedulas.size
      }))
      .sort((a, b) => b.total - a.total);

    return {
      ok: true,
      data: {
        anioMes: anioMes,
        totalMes: mes.total || 0,
        cantidadProyectos: proyectos.length,
        proyectos: proyectos
      }
    };

  } catch (e) {
    return { ok: false, message: "Error en getResumenMesGlobal: " + e.toString() };
  }
}

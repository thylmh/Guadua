import pandas as pd
from sqlalchemy import create_engine
from google.cloud.sql.connector import Connector
from urllib.parse import quote_plus
import logging
import os
import traceback

# 1. CONFIGURACIÓN DE CREDENCIALES
ERP_USER = os.environ.get("ERP_USER", "usrpwbi")
ERP_PASS = os.environ.get("ERP_PASS", "HUMBOLDT25++")
ERP_HOST = os.environ.get("ERP_HOST", "200.32.80.102")
ERP_PORT = os.environ.get("ERP_PORT", "5932")
ERP_DB   = os.environ.get("ERP_DB", "Novasoft_Ent")

# Google Cloud SQL
# Usamos los mismos nombres de variables que en main.py
INSTANCE_CONNECTION_NAME = os.environ.get("CLOUDSQL_CONNECTION_NAME", "bosque-485105:southamerica-east1:bosquebd")
CLOUD_USER = os.environ.get("DB_USER", "bosquebd")
CLOUD_PASS = os.environ.get("DB_PASS", "BosqueDB2026!") 
CLOUD_DB   = os.environ.get("DB_NAME", "bosquebd")

# 2. MAPEO DE TABLAS (Origen Novasoft: Destino Cloud)
TABLAS_A_SINCRONIZAR = {
    'gen_ccosto': 'dim_proyectos',
    'gen_clasif1': 'dim_fuentes',
    'gen_clasif2': 'dim_componentes',
    'gen_clasif3': 'dim_subcomponentes',
    'gen_clasif4': 'dim_categorias',
    'gen_clasif5': 'dim_responsables'
}

# 3. INICIALIZAR CONECTOR CLOUD SQL
connector = Connector()

def get_cloud_conn():
    return connector.connect(
        INSTANCE_CONNECTION_NAME,
        "pymysql",
        user=CLOUD_USER,
        password=CLOUD_PASS,
        db=CLOUD_DB
    )

def format_id3(val):
    """Rellena con ceros a la izquierda hasta 3 caracteres"""
    s = str(val).strip()
    return s.zfill(3) if s.isdigit() and len(s) <= 3 else s

def sync_table(table_erp, table_cloud, erp_engine, cloud_engine):
    """Lógica para subir solo registros nuevos basados en el código"""
    print(f"--- 🔄 Procesando tabla: {table_cloud} ---")
    
    try:
        # A. Leer desde Novasoft
        # Ajustamos la consulta según la tabla
        if table_erp == 'gen_ccosto':
            query_erp = "SELECT CAST(cod_cco AS VARCHAR(50)) AS codigo, nom_cco AS nombre FROM gen_ccosto WHERE est_cco IS NULL"
        else:
            # Para las gen_clasif, asumimos las dos primeras columnas
            query_erp = f"SELECT TOP 1000 * FROM {table_erp}" 
        
        df_erp = pd.read_sql(query_erp, erp_engine)
        
        # Estandarizar nombres de columnas a 'codigo' y 'nombre'
        # Tomamos las dos primeras columnas sin importar el nombre original
        cols_originales = df_erp.columns.tolist()
        df_erp = df_erp.rename(columns={cols_originales[0]: 'codigo', cols_originales[1]: 'nombre'})
        
        # Limpieza y formato
       
        df_erp['codigo'] = df_erp['codigo'].apply(format_id3)
        df_erp['codigo'] = df_erp['codigo'].str.strip()
        df_erp = df_erp.drop_duplicates(subset=['codigo'], keep='first')

        # B. Leer códigos ya existentes en la Nube (Universo completo para proyectos)
        try:
            if table_cloud == 'dim_proyectos':
                query_existentes = "SELECT codigo FROM dim_proyectos UNION SELECT codigo FROM dim_proyectos_otros"
            else:
                query_existentes = f"SELECT codigo FROM {table_cloud}"
                
            df_existentes = pd.read_sql(query_existentes, cloud_engine)
            codes_in_cloud = set(df_existentes['codigo'].tolist())
        except Exception as e:
            print(f"⚠️ Nota: No se pudo leer existentes en {table_cloud} (posible tabla nueva): {e}")
            codes_in_cloud = set()

        # C. Filtrar: Solo lo que NO está en la nube
        df_new = df_erp[~df_erp['codigo'].isin(codes_in_cloud)]

        # D. Cargar solo el diferencial
        if not df_new.empty:
            # Solo enviamos las columnas 'codigo' y 'nombre' para mantener consistencia
            df_new[['codigo', 'nombre']].to_sql(table_cloud, cloud_engine, if_exists='append', index=False)
            print(f"✅ Éxito: Se agregaron {len(df_new)} registros nuevos.")
        else:
            print(f"ℹ️ Al día: No hay códigos nuevos para agregar.")

    except Exception as e:
        print(f"❌ Error procesando {table_cloud}: {e}")
        traceback.print_exc()

def run_sync():
    # Motores de base de datos
    import pyodbc
    drivers = pyodbc.drivers()
    driver = "ODBC Driver 17 for SQL Server"
    if driver not in drivers:
        # Fallback al que esté disponible que sea para SQL Server
        for d in drivers:
            if "SQL Server" in d:
                driver = d
                break
    
    print(f"ℹ️ Usando driver: {driver}")
    safe_erp_pass = quote_plus(ERP_PASS)
    erp_url = f"mssql+pyodbc://{ERP_USER}:{safe_erp_pass}@{ERP_HOST}:{ERP_PORT}/{ERP_DB}?driver={quote_plus(driver)}"
    erp_engine = create_engine(erp_url)
    
    # Engine de la nube usa el túnel de Google
    cloud_engine = create_engine("mysql+pymysql://", creator=get_cloud_conn)
    
    print("🚀 Iniciando proceso de sincronización integral...")
    
    for erp_tab, cloud_tab in TABLAS_A_SINCRONIZAR.items():
        sync_table(erp_tab, cloud_tab, erp_engine, cloud_engine)
    
    print("\n🏁 Proceso finalizado.")

if __name__ == "__main__":
    run_sync()
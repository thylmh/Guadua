SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '1d81b38f-f752-11f0-8bd2-42010a400003:1-4683';

--
-- Table structure for table `BAuditoria`
--

DROP TABLE IF EXISTS `BAuditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BAuditoria` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `timestamp` datetime DEFAULT (now()),
  `actor_email` varchar(255) NOT NULL,
  `actor_ip` varchar(45) DEFAULT NULL,
  `module` varchar(50) NOT NULL,
  `action` varchar(50) NOT NULL,
  `resource_id` varchar(255) DEFAULT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `details` text,
  PRIMARY KEY (`id`),
  KEY `ix_BAuditoria_module` (`module`),
  KEY `ix_BAuditoria_id` (`id`),
  KEY `ix_BAuditoria_timestamp` (`timestamp`),
  KEY `ix_BAuditoria_action` (`action`),
  KEY `ix_BAuditoria_resource_id` (`resource_id`),
  KEY `ix_BAuditoria_actor_email` (`actor_email`)
) ENGINE=InnoDB AUTO_INCREMENT=1612 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BContrato`
--

DROP TABLE IF EXISTS `BContrato`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BContrato` (
  `id_contrato` varchar(50) NOT NULL,
  `posicion` varchar(50) DEFAULT NULL,
  `cedula` varchar(20) DEFAULT NULL,
  `familia` varchar(100) DEFAULT NULL,
  `cargo` varchar(150) DEFAULT NULL,
  `rol` varchar(150) DEFAULT NULL,
  `banda` varchar(20) DEFAULT NULL,
  `salario` decimal(15,2) DEFAULT NULL,
  `nivel_riesgo` varchar(10) DEFAULT NULL,
  `atep` decimal(10,5) DEFAULT NULL,
  `direccion` varchar(150) DEFAULT NULL,
  `gerencia` varchar(150) DEFAULT NULL,
  `area` varchar(150) DEFAULT NULL,
  `subarea` varchar(150) DEFAULT NULL,
  `tipo_contrato` varchar(100) DEFAULT NULL,
  `num_contrato` varchar(100) DEFAULT NULL,
  `fecha_contrato` date DEFAULT NULL,
  `num_otrosi` varchar(50) DEFAULT NULL,
  `prorrogas_fecha` varchar(50) DEFAULT NULL,
  `fecha_ingreso` date DEFAULT NULL,
  `fecha_terminacion` date DEFAULT NULL,
  `modalidad` varchar(100) DEFAULT NULL,
  `total_dias_tele` decimal(5,1) DEFAULT NULL,
  `sede` varchar(100) DEFAULT NULL,
  `ciudad_contratacion` varchar(150) DEFAULT NULL,
  `estado` varchar(50) DEFAULT NULL,
  `metodo_selec` varchar(100) DEFAULT NULL,
  `encargo` varchar(10) DEFAULT NULL,
  `motivo_ingreso` varchar(150) DEFAULT NULL,
  `fecha_terminacion_real` date DEFAULT NULL,
  `causal_retiro` varchar(255) DEFAULT NULL,
  `usuario` varchar(100) DEFAULT NULL,
  `modificacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id_contrato`),
  KEY `cedula` (`cedula`),
  KEY `fk_contrato_posicion` (`posicion`),
  CONSTRAINT `BContrato_ibfk_1` FOREIGN KEY (`cedula`) REFERENCES `BData` (`cedula`),
  CONSTRAINT `fk_contrato_posicion` FOREIGN KEY (`posicion`) REFERENCES `BPosicion` (`IDPosicion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BData`
--

DROP TABLE IF EXISTS `BData`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BData` (
  `cedula` varchar(20) NOT NULL,
  `p_apellido` varchar(100) DEFAULT NULL,
  `s_apellido` varchar(100) DEFAULT NULL,
  `p_nombre` varchar(100) DEFAULT NULL,
  `s_nombre` varchar(100) DEFAULT NULL,
  `correo_electronico` varchar(150) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `genero` varchar(20) DEFAULT NULL,
  `estado_civil` varchar(50) DEFAULT NULL,
  `tipo_sangre` varchar(10) DEFAULT NULL,
  `gestacion` varchar(10) DEFAULT NULL,
  `direccion_residencia` varchar(255) DEFAULT NULL,
  `barrio` varchar(100) DEFAULT NULL,
  `departamento` varchar(100) DEFAULT NULL,
  `ciudad` varchar(100) DEFAULT NULL,
  `usuario` varchar(100) DEFAULT NULL,
  `modificacion` datetime DEFAULT NULL,
  PRIMARY KEY (`cedula`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BFinanciacion`
--

DROP TABLE IF EXISTS `BFinanciacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BFinanciacion` (
  `id_financiacion` varchar(50) NOT NULL,
  `id_contrato` varchar(50) DEFAULT NULL,
  `posicion` varchar(50) DEFAULT NULL,
  `cedula` varchar(20) DEFAULT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `salario_base` decimal(15,2) DEFAULT NULL,
  `salario_t` decimal(15,2) DEFAULT NULL,
  `pago_proyectado` decimal(15,2) DEFAULT NULL,
  `rubro` varchar(100) DEFAULT NULL,
  `id_proyecto` varchar(50) DEFAULT NULL,
  `id_fuente` varchar(50) DEFAULT NULL,
  `id_componente` varchar(50) DEFAULT NULL,
  `id_subcomponente` varchar(50) DEFAULT NULL,
  `id_categoria` varchar(50) DEFAULT NULL,
  `id_responsable` varchar(50) DEFAULT NULL,
  `modifico` varchar(100) DEFAULT NULL,
  `modifico_app` varchar(150) DEFAULT NULL,
  `fecha_modificacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id_financiacion`),
  KEY `cedula` (`cedula`),
  KEY `id_contrato` (`id_contrato`),
  CONSTRAINT `BFinanciacion_ibfk_1` FOREIGN KEY (`cedula`) REFERENCES `BData` (`cedula`),
  CONSTRAINT `BFinanciacion_ibfk_2` FOREIGN KEY (`id_contrato`) REFERENCES `BContrato` (`id_contrato`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BFinanciacion_Snapshot`
--

DROP TABLE IF EXISTS `BFinanciacion_Snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BFinanciacion_Snapshot` (
  `snapshot_id` bigint NOT NULL AUTO_INCREMENT,
  `version_id` int NOT NULL,
  `original_id_financiacion` varchar(50) DEFAULT NULL,
  `cedula` varchar(20) DEFAULT NULL,
  `id_proyecto` varchar(50) DEFAULT NULL,
  `id_contrato` varchar(50) DEFAULT NULL,
  `posicion` varchar(100) DEFAULT NULL,
  `cod_proyecto` varchar(50) DEFAULT NULL,
  `cod_fuente` varchar(50) DEFAULT NULL,
  `cod_componente` varchar(50) DEFAULT NULL,
  `cod_subcomponente` varchar(50) DEFAULT NULL,
  `cod_rubro` varchar(50) DEFAULT NULL,
  `cod_categoria` varchar(50) DEFAULT NULL,
  `cod_responsable` varchar(50) DEFAULT NULL,
  `valor_mensual` decimal(18,2) DEFAULT NULL,
  `salario_t` decimal(18,2) DEFAULT NULL,
  `pago_proyectado` decimal(18,2) DEFAULT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  PRIMARY KEY (`snapshot_id`),
  KEY `IDX_Snapshot_Version` (`version_id`),
  CONSTRAINT `BFinanciacion_Snapshot_ibfk_1` FOREIGN KEY (`version_id`) REFERENCES `Presupuesto_Versiones` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10236 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BIncremento`
--

DROP TABLE IF EXISTS `BIncremento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BIncremento` (
  `id` varchar(10) NOT NULL,
  `anio` int NOT NULL,
  `smlv` decimal(15,2) NOT NULL,
  `transporte` decimal(15,2) NOT NULL,
  `dotacion` decimal(15,2) NOT NULL,
  `porcentaje_aumento` decimal(5,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `anio` (`anio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BNomina`
--

DROP TABLE IF EXISTS `BNomina`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BNomina` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cod_emp` varchar(50) DEFAULT NULL,
  `cod_con` varchar(50) DEFAULT NULL,
  `nom_con` varchar(255) DEFAULT NULL,
  `val_liq` decimal(15,2) DEFAULT NULL,
  `nom_liq` varchar(255) DEFAULT NULL,
  `fec_liq` date DEFAULT NULL,
  `cod_fondo` varchar(100) DEFAULT NULL,
  `fdec` varchar(100) DEFAULT NULL,
  `rubro` varchar(100) DEFAULT NULL,
  `cta_cre` varchar(100) DEFAULT NULL,
  `interfase` varchar(100) DEFAULT NULL,
  `s_p` varchar(100) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `id_proyecto` varchar(100) DEFAULT NULL,
  `id_fuente` varchar(100) DEFAULT NULL,
  `id_componente` varchar(100) DEFAULT NULL,
  `id_subcomponente` varchar(100) DEFAULT NULL,
  `id_categoria` varchar(100) DEFAULT NULL,
  `id_responsable` varchar(100) DEFAULT NULL,
  `fecha_carga` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ced_fec` (`cod_emp`,`fec_liq`),
  KEY `idx_granularity` (`cod_emp`,`fec_liq`,`id_proyecto`,`id_fuente`,`id_componente`)
) ENGINE=InnoDB AUTO_INCREMENT=8950 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BNotificaciones`
--

DROP TABLE IF EXISTS `BNotificaciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BNotificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_email` varchar(255) NOT NULL,
  `mensaje` text NOT NULL,
  `leido` tinyint(1) DEFAULT '0',
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `tipo` varchar(50) DEFAULT 'INFO',
  `solicitud_id` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BPosicion`
--

DROP TABLE IF EXISTS `BPosicion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BPosicion` (
  `IDPosicion` varchar(50) NOT NULL,
  `Salario` decimal(15,2) DEFAULT NULL,
  `Familia` varchar(100) DEFAULT NULL,
  `Cargo` varchar(250) DEFAULT NULL,
  `Rol` varchar(250) DEFAULT NULL,
  `Banda` varchar(50) DEFAULT NULL,
  `Direccion` varchar(250) DEFAULT NULL,
  `Gerencia` varchar(250) DEFAULT NULL,
  `Area` varchar(250) DEFAULT NULL,
  `Subarea` varchar(250) DEFAULT NULL,
  `Planta` varchar(100) DEFAULT NULL,
  `Tipo_planta` varchar(100) DEFAULT NULL,
  `Base_Fuente` varchar(250) DEFAULT NULL,
  `Estado` varchar(50) DEFAULT NULL,
  `P_Jefe` varchar(100) DEFAULT NULL,
  `Observacion` text,
  `Usuario` varchar(100) DEFAULT NULL,
  `Modificacion` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`IDPosicion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BSolicitud_Cambio`
--

DROP TABLE IF EXISTS `BSolicitud_Cambio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BSolicitud_Cambio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_solicitud` varchar(20) DEFAULT NULL,
  `id_financiacion_afectado` varchar(50) DEFAULT NULL,
  `cedula` varchar(20) DEFAULT NULL,
  `datos_anteriores` text,
  `datos_nuevos` text,
  `justificacion` varchar(500) DEFAULT NULL,
  `solicitante` varchar(100) DEFAULT NULL,
  `fecha_solicitud` datetime DEFAULT CURRENT_TIMESTAMP,
  `estado` varchar(20) DEFAULT 'PENDIENTE',
  `aprobador` varchar(100) DEFAULT NULL,
  `fecha_decision` datetime DEFAULT NULL,
  `fecha_aprobacion` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=87 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BWhitelist`
--

DROP TABLE IF EXISTS `BWhitelist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BWhitelist` (
  `email` varchar(150) NOT NULL,
  `role` varchar(50) DEFAULT 'admin',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `cedula` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Presupuesto_Versiones`
--

DROP TABLE IF EXISTS `Presupuesto_Versiones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Presupuesto_Versiones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_version` varchar(100) NOT NULL,
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `creado_por` varchar(100) DEFAULT NULL,
  `descripcion` varchar(500) DEFAULT NULL,
  `bloqueada` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_categorias`
--

DROP TABLE IF EXISTS `dim_categorias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_categorias` (
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_componentes`
--

DROP TABLE IF EXISTS `dim_componentes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_componentes` (
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_fuentes`
--

DROP TABLE IF EXISTS `dim_fuentes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_fuentes` (
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_proyectos`
--

DROP TABLE IF EXISTS `dim_proyectos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_proyectos` (
  `codigo` text,
  `nombre` text,
  `estado` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_proyectos_otros`
--

DROP TABLE IF EXISTS `dim_proyectos_otros`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_proyectos_otros` (
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  `estado` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_responsables`
--

DROP TABLE IF EXISTS `dim_responsables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_responsables` (
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dim_subcomponentes`
--

DROP TABLE IF EXISTS `dim_subcomponentes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dim_subcomponentes` (
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `vista_proyectos_total`
--

DROP TABLE IF EXISTS `vista_proyectos_total`;
/*!50001 DROP VIEW IF EXISTS `vista_proyectos_total`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vista_proyectos_total` AS SELECT 
 1 AS `codigo`,
 1 AS `nombre`,
 1 AS `estado`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `vista_proyectos_total`
--

/*!50001 DROP VIEW IF EXISTS `vista_proyectos_total`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`bosquebd`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `vista_proyectos_total` AS select `union_proyectos`.`codigo` AS `codigo`,`union_proyectos`.`nombre` AS `nombre`,`union_proyectos`.`estado` AS `estado` from (select `dim_proyectos`.`codigo` AS `codigo`,`dim_proyectos`.`nombre` AS `nombre`,`dim_proyectos`.`estado` AS `estado` from `dim_proyectos` union select `dim_proyectos_otros`.`codigo` AS `codigo`,`dim_proyectos_otros`.`nombre` AS `nombre`,`dim_proyectos_otros`.`estado` AS `estado` from `dim_proyectos_otros` where `dim_proyectos_otros`.`codigo` in (select `dim_proyectos`.`codigo` from `dim_proyectos`) is false) `union_proyectos` order by `union_proyectos`.`nombre` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-09 18:17:37

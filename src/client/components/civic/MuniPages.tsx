import { CivicCampaignBanner, CivicFAQ, CivicNewsGrid, EmergencyStrip, OfficialSourceBadge } from './CivicSystem.tsx';

export function ElNinoLanding() {
  return <main id="main" className="civic-page el-nino-page" data-testid="el-nino-landing">
    <CivicCampaignBanner/>
    <OfficialSourceBadge/>
    <div className="el-nino-layout">
      <article className="el-nino-content">
        <section id="que-es">
          <p className="section-kicker">Qué es</p>
          <h1>Fenómeno El Niño</h1>
          <p className="lead">El Niño es una variación natural del sistema océano-atmósfera que puede modificar patrones de precipitación y temperatura. En Santa Fe puede aumentar la probabilidad de episodios de lluvia más frecuentes o intensos, pero no equivale automáticamente a una inundación ni a una emergencia.</p>
        </section>
        <section>
          <h2>Qué puede implicar en Santa Fe</h2>
          <p>La combinación de lluvias locales, niveles de los ríos, capacidad de drenaje y condiciones territoriales determina el impacto real. Por eso SOS-SF separa mediciones observadas, vigencia de datos y alertas oficiales.</p>
        </section>
        <section>
          <h2>Qué está haciendo la ciudad</h2>
          <p>Según la Dirección de Gestión de Riesgo, la preparación municipal incluye mantenimiento de desagües, estaciones de bombeo, reservorios y sistemas hídricos, junto con planificación y coordinación institucional. Estas acciones se muestran como información atribuida: no son acciones ejecutadas por SOS-SF.</p>
        </section>
        <section>
          <h2>Capacitaciones · Comunidad Preparada</h2>
          <p>El municipio ha publicado el programa <strong>Comunidad Preparada</strong> y capacitaciones barriales orientadas a prevención y respuesta. SOS-SF atribuye esa información y no se presenta como organizador de las actividades.</p>
        </section>
        <section>
          <h2>Agenda vigente</h2>
          <p>Las fechas de capacitaciones y actividades pueden cambiar. SOS-SF no presenta una agenda histórica como vigente si no puede verificarla en la fuente actual; para horarios y sedes corresponde consultar el canal municipal de Gestión de Riesgo.</p>
        </section>
        <section>
          <h2>Preguntas frecuentes</h2>
          <CivicFAQ/>
        </section>
        <section>
          <h2>Planificación continua</h2>
          <p>La gestión del riesgo hídrico requiere coordinación entre áreas municipales, Provincia y actores metropolitanos. SOS-SF no sustituye planes operativos, protocolos barriales ni instrucciones de organismos competentes.</p>
        </section>
        <section>
          <h2>Cómo funcionan las bombas</h2>
          <p>Las estaciones de bombeo permiten evacuar agua desde sectores protegidos cuando la descarga por gravedad no alcanza o las condiciones del sistema lo requieren. Su operación depende de infraestructura, niveles, lluvias y decisiones técnicas; una lectura de río aislada no describe por sí sola su estado operativo.</p>
        </section>
        <section>
          <h2>Plan de contingencia</h2>
          <p>Los protocolos de contingencia son territoriales y dependen de condiciones observadas y decisiones de las autoridades responsables. SOS-SF muestra datos y enlaces de contexto, pero no convierte una cifra aislada en una orden de evacuación.</p>
        </section>
        <section>
          <h2>Familias fuera de defensas</h2>
          <p>La información municipal de Gestión de Riesgo contempla situaciones particulares de familias ubicadas fuera de defensas. La vulnerabilidad y las acciones aplicables deben interpretarse con el protocolo territorial vigente y los canales oficiales, no a partir de una regla general de SOS-SF.</p>
        </section>
        <section>
          <h2>Referencia específica de Vuelta del Paraguayo</h2>
          <p>La documentación municipal ha citado <strong>5,30 m</strong> dentro de un protocolo territorial específico para Vuelta del Paraguayo. Esa cifra se conserva sólo como referencia municipal atribuida: <strong>no es un umbral general de evacuación de SOS-SF</strong> y no debe extrapolarse a otros barrios o estaciones.</p>
        </section>
        <section id="fuentes-el-nino">
          <h2>Noticias y fuentes relacionadas</h2>
          <CivicNewsGrid/>
        </section>
      </article>
      <aside className="el-nino-aside">
        <h2>Para consultar ahora</h2>
        <a href="/#situacion-hidrica">Situación hidrométrica</a>
        <a href="/#alertas">Alertas y emergencias</a>
        <a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/fenomeno-el-nino/" target="_blank" rel="noreferrer">Página municipal fuente ↗</a>
        <p>Consulta editorial: 7/8/2026. Si una agenda, cifra o contenido dejó de estar publicado, prevalece la fuente oficial actual.</p>
      </aside>
    </div>
    <EmergencyStrip/>
  </main>;
}

import { CivicCampaignBanner, CivicFAQ, CivicNewsGrid, EmergencyStrip, OfficialSourceBadge } from './CivicSystem.tsx';

export function ElNinoLanding() {
  return <main id="main" className="civic-page el-nino-page" data-testid="el-nino-landing">
    <CivicCampaignBanner/>
    <OfficialSourceBadge/>
    <div className="el-nino-layout">
      <article className="el-nino-content">
        <section id="que-es" className="el-nino-lead">
          <p className="section-kicker">Entender antes de preocuparse</p>
          <h1>Qué significa El Niño para Santa Fe</h1>
          <p className="lead">Es un fenómeno natural que puede cambiar patrones de lluvia y temperatura. Puede aumentar la probabilidad de episodios intensos, pero <strong>no significa automáticamente inundación ni emergencia</strong>.</p>
        </section>
        <section><h2>Qué conviene mirar de verdad</h2><p>La situación depende de varias cosas a la vez: lluvias locales, niveles del Paraná y el Salado, drenaje, infraestructura y condiciones territoriales. Una cifra aislada nunca cuenta toda la historia.</p></section>
        <section><h2>Cómo lo presenta SOS-SF</h2><p>Separamos mediciones observadas, antigüedad del dato, tendencia y alertas oficiales. Si una fuente no puede verificarse, lo decimos sin convertir esa incertidumbre en una alarma.</p></section>
        <section><h2>Preparación de la ciudad</h2><p>La Dirección de Gestión de Riesgo publica información sobre desagües, estaciones de bombeo, reservorios, planificación y trabajo comunitario. SOS-SF la muestra con atribución y enlaza la fuente oficial.</p></section>
        <section><h2>La referencia de 5,30 m</h2><p>Ese valor aparece en documentación municipal vinculada a un protocolo territorial específico de Vuelta del Paraguayo. <strong>No es un umbral general de evacuación de SOS-SF</strong> y no debe trasladarse a otros barrios o estaciones.</p></section>
        <section><h2>Preguntas comunes</h2><CivicFAQ/></section>
        <section id="fuentes-el-nino"><h2>Para profundizar</h2><CivicNewsGrid/></section>
      </article>
      <aside className="el-nino-aside">
        <span>Atajos</span>
        <h2>Para consultar ahora</h2>
        <a href="/#situacion-hidrica">Ver Paraná y Salado</a>
        <a href="/#alertas">Alertas y ayuda</a>
        <a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/fenomeno-el-nino/" target="_blank" rel="noreferrer">Fuente municipal ↗</a>
        <p>Las agendas y contenidos pueden cambiar. Para información operativa vigente, prevalece siempre la fuente oficial actual.</p>
      </aside>
    </div>
    <EmergencyStrip/>
  </main>;
}

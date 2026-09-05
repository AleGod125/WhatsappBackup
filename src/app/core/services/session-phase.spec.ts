import { normalizeSession } from './session.service';

/**
 * La pantalla de vinculación tiene que decir la verdad sobre en qué punto está.
 *
 * Con `SESSION_INVALID` el backend está comprobando si la vinculación guardada
 * sigue viva; hacen falta tres rechazos seguidos para archivarla y pedir un
 * código nuevo. Durante ese rato la pantalla decía "Preparando tu código QR",
 * que no era cierto: no se estaba preparando ninguno. El usuario esperaba sin
 * ninguna señal de que algo avanzara.
 */
describe('fase de vinculación', () => {
  it('distingue verificar la sesión guardada de necesitar un código', () => {
    const verificando = normalizeSession({
      state: 'SESSION_INVALID',
      connected: false,
      session_file_present: true,
      pairing_phase: 'verifying_session',
      session_rejections: 2,
      session_rejections_max: 3,
    });
    expect(verificando.pairingPhase).toBe('verifying_session');
    expect(verificando.sessionRejections).toBe(2);
    expect(verificando.sessionRejectionsMax).toBe(3);

    const hacenFaltaCodigo = normalizeSession({
      state: 'PAIRING_REQUIRED',
      connected: false,
      session_file_present: false,
      pairing_phase: 'pairing_required',
    });
    expect(hacenFaltaCodigo.pairingPhase).toBe('pairing_required');
  });

  it('deduce la fase si el backend es anterior y no la manda', () => {
    // Sin esto la pantalla volvería al mensaje genérico contra un backend viejo.
    expect(
      normalizeSession({
        state: 'SESSION_INVALID',
        connected: false,
        session_file_present: true,
      }).pairingPhase,
    ).toBe('verifying_session');

    expect(normalizeSession({ state: 'PAIRING', qr_available: true }).pairingPhase).toBe(
      'qr_ready',
    );
    expect(normalizeSession({ state: 'CONNECTED', connected: true }).pairingPhase).toBe(
      'connected',
    );
  });

  it('una fase desconocida no rompe la pantalla', () => {
    const valor = normalizeSession({ state: 'PAIRING', pairing_phase: 'algo_nuevo' });
    expect(valor.pairingPhase).not.toBe('algo_nuevo');
  });

  it('SESSION_INVALID sin sesión en disco no es "verificando"', () => {
    // No hay nada que verificar: hace falta un código.
    expect(
      normalizeSession({
        state: 'SESSION_INVALID',
        connected: false,
        session_file_present: false,
      }).pairingPhase,
    ).not.toBe('verifying_session');
  });

  it('nunca expone el contenido del QR', () => {
    // El payload es una credencial de vinculación: solo viaja como imagen.
    const valor = normalizeSession({
      state: 'PAIRING',
      qr_available: true,
      payload: '2@SECRETO',
    }) as unknown as Record<string, unknown>;
    expect(JSON.stringify(valor)).not.toContain('2@SECRETO');
  });
});

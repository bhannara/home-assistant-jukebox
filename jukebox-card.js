/*
 * Jukebox Card
 * Original project: https://github.com/lukx/home-assistant-jukebox
 *
 * Compatibility update for newer Home Assistant frontends.
 * Changes from the original version:
 * - Replaced deprecated paper-tabs / paper-tab speaker controls with native HTML/CSS.
 * - Replaced mwc-button station controls with native HTML buttons.
 * - Added optional per-entity display names while preserving the original string entity syntax.
 * - Added optional `columns` support for fixed station grids.
 * - Fixed station buttons to equal height with single-line centered labels.
 * - Replaced the collapsed idle control row with a fixed-height idle icon to prevent layout shifts.
 * - Kept the volume icon visible for players without mute support.
 * - Matched the non-mute volume indicator to the same `ha-icon-button` structure as the control buttons.
 * - Adopted Home Assistant's media-player volume-control layout and sizing.
 * - Added an optional `show_media_title` now-playing title that maps matching station URLs, `keys=` values, or media filenames to configured names.
 * - Grouped the now-playing title and media controls into a compact inline media-player row.
 */

class JukeboxCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;
    this._selectedSpeaker = null;
    this._entityConfigs = [];
    this._built = false;
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('You need to define your media player entities');
    }
    if (!Array.isArray(config.links)) {
      throw new Error('You need to define links');
    }

    const showMediaTitle = config.show_media_title === true;

    const entityConfigs = config.entities.map((entry) => {
      if (typeof entry === 'string' && entry.trim()) {
        return { entity: entry.trim(), name: null };
      }
      if (entry && typeof entry === 'object' && typeof entry.entity === 'string' && entry.entity.trim()) {
        return {
          entity: entry.entity.trim(),
          name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null,
        };
      }
      throw new Error('Each entity must be an entity ID string or an object with `entity` and optional `name`');
    });

    this._config = {
      ...config,
      show_media_title: showMediaTitle,
    };
    this._entityConfigs = entityConfigs;

    if (this._built) {
      this._built = false;
      this._selectedSpeaker = null;
      this.replaceChildren();
      if (this._hass) this._build();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._build();
    this._update();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    const columns = Number.isInteger(Number(this._config?.columns)) && Number(this._config.columns) > 0
      ? Number(this._config.columns)
      : 3;
    const rows = Math.max(1, Math.ceil((this._config?.links?.length || 0) / columns));
    return Math.max(3, 2 + rows);
  }

  _build() {
    if (!this._hass || !this._config) return;

    const validEntities = this._entityConfigs.filter((entry) => this._hass.states[entry.entity]);

    const style = document.createElement('style');
    style.textContent = this._styles();
    this.appendChild(style);

    const card = document.createElement('ha-card');
    card.className = 'jukebox-card';

    if (validEntities.length === 0) {
      const error = document.createElement('div');
      error.className = 'jukebox-error';
      error.textContent = 'Jukebox: configured media_player entities were not found.';
      card.appendChild(error);
      this.appendChild(card);
      this._built = true;
      return;
    }

    const firstPlaying = validEntities.find(
      (entry) => this._hass.states[entry.entity]?.state === 'playing'
    );
    this._selectedSpeaker = (firstPlaying || validEntities[0]).entity;

    const content = document.createElement('div');
    content.className = 'jukebox-content';
    content.appendChild(this._buildSpeakerTabs(validEntities));
    content.appendChild(this._buildMediaPlayerSection());
    content.appendChild(this._buildStationList());

    card.appendChild(content);
    this.appendChild(card);
    this._built = true;
  }

  _buildSpeakerTabs(entities) {
    const tabs = document.createElement('div');
    tabs.className = 'jukebox-speaker-tabs';
    tabs.setAttribute('role', 'tablist');

    entities.forEach((entry) => {
      const entityId = entry.entity;
      const state = this._hass.states[entityId];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jukebox-speaker-tab';
      button.dataset.entityId = entityId;
      button.setAttribute('role', 'tab');
      button.textContent = entry.name || state?.attributes?.friendly_name || entityId;
      button.addEventListener('click', () => {
        this._selectedSpeaker = entityId;
        this._update();
      });
      tabs.appendChild(button);
    });

    this._tabs = tabs;
    return tabs;
  }

  _buildVolumeControls() {
    const mediaRow = document.createElement('div');
    mediaRow.className = 'jukebox-media-row';

    const volume = document.createElement('div');
    volume.className = 'jukebox-volume';

    const muteButton = document.createElement('ha-icon-button');
    muteButton.className = 'jukebox-mute';
    muteButton.label = 'Mute or unmute';
    const muteIcon = document.createElement('ha-icon');
    muteIcon.setAttribute('icon', 'mdi:volume-high');
    muteButton.appendChild(muteIcon);
    muteButton.addEventListener('click', () => this._toggleMute());

    const volumeIndicator = document.createElement('ha-icon-button');
    volumeIndicator.className = 'jukebox-volume-indicator';
    volumeIndicator.label = 'Volume';
    volumeIndicator.setAttribute('aria-disabled', 'true');
    volumeIndicator.tabIndex = -1;
    const volumeIndicatorIcon = document.createElement('ha-icon');
    volumeIndicatorIcon.setAttribute('icon', 'mdi:volume-high');
    volumeIndicator.appendChild(volumeIndicatorIcon);

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'jukebox-volume-slider-container';

    const slider = document.createElement('ha-slider');
    slider.className = 'jukebox-volume-slider volume-slider';
    slider.setAttribute('labeled', '');
    slider.min = 0;
    slider.max = 100;
    slider.step = 1;
    slider.addEventListener('change', (event) => {
      const value = Number(event.currentTarget.value);
      this._setVolume(value / 100);
    });
    sliderContainer.appendChild(slider);

    const stopButton = document.createElement('ha-icon-button');
    stopButton.className = 'jukebox-stop';
    stopButton.label = 'Stop playback';
    const stopIcon = document.createElement('ha-icon');
    stopIcon.setAttribute('icon', 'mdi:stop');
    stopButton.appendChild(stopIcon);
    stopButton.addEventListener('click', () => this._stop());

    volume.append(muteButton, volumeIndicator, sliderContainer, stopButton);

    const idleStatus = document.createElement('div');
    idleStatus.className = 'jukebox-idle-status';
    const idleButton = document.createElement('ha-icon-button');
    idleButton.className = 'jukebox-idle-radio';
    idleButton.tabIndex = -1;
    idleButton.setAttribute('aria-hidden', 'true');
    const idleIcon = document.createElement('ha-icon');
    idleIcon.setAttribute('icon', 'mdi:playlist-music');
    idleButton.appendChild(idleIcon);
    idleStatus.appendChild(idleButton);

    mediaRow.append(volume, idleStatus);

    this._volumeContainer = mediaRow;
    this._volumeControls = volume;
    this._idleStatus = idleStatus;
    this._muteButton = muteButton;
    this._muteIcon = muteIcon;
    this._volumeIndicator = volumeIndicator;
    this._volumeSliderContainer = sliderContainer;
    this._volumeSlider = slider;
    this._stopButton = stopButton;

    return mediaRow;
  }

  _buildMediaPlayerSection() {
    const section = document.createElement('div');
    section.className = 'jukebox-media-player';

    if (this._config.show_media_title) {
      section.classList.add('with-title');
      section.appendChild(this._buildMediaTitle());
    } else {
      this._mediaTitle = null;
    }

    section.appendChild(this._buildVolumeControls());

    return section;
  }

  _buildMediaTitle() {
    const title = document.createElement('div');
    title.className = 'jukebox-media-title';
    title.hidden = true;
    this._mediaTitle = title;
    return title;
  }

  _buildStationList() {
    const list = document.createElement('div');
    list.className = 'jukebox-station-list';

    const columns = Number(this._config.columns);
    if (Number.isInteger(columns) && columns > 0) {
      list.classList.add('fixed-columns');
      list.style.setProperty('--jukebox-columns', String(columns));
    }

    this._stationButtons = [];

    this._config.links.forEach((link) => {
      if (!link || !link.url) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jukebox-station-button';
      button.textContent = link.name || link.url;
      button.title = link.name || link.url;
      button.dataset.stationUrl = link.url;
      button.dataset.mediaContentType =
        link.media_content_type ||
        link.type ||
        this._config.media_content_type ||
        'audio/mp4';

      button.addEventListener('click', () => this._playStation(button));
      this._stationButtons.push(button);
      list.appendChild(button);
    });

    return list;
  }

  _toggleMute() {
    const state = this._hass?.states?.[this._selectedSpeaker];
    if (!state) return;
    if (!Object.prototype.hasOwnProperty.call(state.attributes || {}, 'is_volume_muted')) return;

    this._hass.callService('media_player', 'volume_mute', {
      entity_id: this._selectedSpeaker,
      is_volume_muted: !Boolean(state.attributes?.is_volume_muted),
    });
  }

  _stop() {
    if (!this._selectedSpeaker) return;
    this._hass.callService('media_player', 'media_stop', {
      entity_id: this._selectedSpeaker,
    });
  }

  _setVolume(value) {
    if (!this._selectedSpeaker || Number.isNaN(value)) return;
    this._hass.callService('media_player', 'volume_set', {
      entity_id: this._selectedSpeaker,
      volume_level: Math.max(0, Math.min(1, value)),
    });
  }

  _playStation(button) {
    if (!this._selectedSpeaker) return;
    this._hass.callService('media_player', 'play_media', {
      entity_id: this._selectedSpeaker,
      media_content_id: button.dataset.stationUrl,
      media_content_type: button.dataset.mediaContentType || 'audio/mp4',
    });
  }

  _stationIdentity(value) {
    if (!value) return '';

    const source = String(value).trim();
    const match = source.match(/[?&]keys=([^&#]+)/i);
    if (match) {
      try {
        return `keys:${decodeURIComponent(match[1])}`;
      } catch (_error) {
        return `keys:${match[1]}`;
      }
    }

    let cleanSource = source.split(/[?#]/)[0];
    try {
      cleanSource = decodeURIComponent(cleanSource);
    } catch (_error) {
      // Keep the original text when percent-decoding fails.
    }

    const filename = cleanSource.split('/').pop() || cleanSource;
    const basename = filename.replace(/\.[^.]+$/, '');

    return `media:${basename}`;
  }

  _findMatchingLink(...values) {
    const identities = values
      .filter(Boolean)
      .map((value) => this._stationIdentity(value));

    if (!identities.length) return null;

    return this._config.links.find((link) => {
      if (!link?.url) return false;
      const linkIdentity = this._stationIdentity(link.url);
      return identities.includes(linkIdentity);
    }) || null;
  }

  _update() {
    if (!this._built || !this._hass) return;

    let state = this._hass.states[this._selectedSpeaker];
    if (!state) {
      const fallback = this._entityConfigs.find((entry) => this._hass.states[entry.entity]);
      if (!fallback) return;
      this._selectedSpeaker = fallback.entity;
      state = this._hass.states[fallback.entity];
    }

    this._tabs?.querySelectorAll('.jukebox-speaker-tab').forEach((tab) => {
      const selected = tab.dataset.entityId === this._selectedSpeaker;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    const attrs = state.attributes || {};
    const hasVolume = Object.prototype.hasOwnProperty.call(attrs, 'volume_level');
    const hasMute = Object.prototype.hasOwnProperty.call(attrs, 'is_volume_muted');
    const muted = Boolean(attrs.is_volume_muted);

    const showControls =
      (state.state === 'playing' || state.state === 'paused') &&
      (hasVolume || hasMute);

    if (this._volumeControls) {
      this._volumeControls.hidden = !showControls;
    }

    if (this._idleStatus) {
      this._idleStatus.hidden = showControls;
    }

    if (this._volumeSliderContainer) {
      this._volumeSliderContainer.hidden = !hasVolume;
    }

    if (this._volumeSlider) {
      this._volumeSlider.value = Math.round((Number(attrs.volume_level) || 0) * 100);
      this._volumeSlider.disabled = muted;
    }

    if (this._muteButton) {
      this._muteButton.hidden = !hasMute;
      this._muteButton.label = 'Mute or unmute';
      if (this._muteIcon) {
        this._muteIcon.setAttribute('icon', muted ? 'mdi:volume-off' : 'mdi:volume-high');
      }
    }

    if (this._volumeIndicator) {
      this._volumeIndicator.hidden = hasMute || !hasVolume;
    }

    if (this._stopButton) {
      this._stopButton.hidden = !hasVolume;
      this._stopButton.disabled = state.state !== 'playing' && state.state !== 'paused';
    }

    const isActiveMedia = state.state === 'playing' || state.state === 'paused';
    const playingUrl = isActiveMedia ? attrs.media_content_id : null;
    const matchedLink = isActiveMedia
      ? this._findMatchingLink(attrs.media_content_id, attrs.media_title)
      : null;

    if (this._config.show_media_title && this._mediaTitle) {
      const mediaTitle =
        (matchedLink && (matchedLink.name || matchedLink.url)) ||
        attrs.media_title ||
        '';
      this._mediaTitle.textContent = mediaTitle;
      this._mediaTitle.hidden = !isActiveMedia || !mediaTitle;
    }

    this._stationButtons?.forEach((button) => {
      const active = Boolean(matchedLink)
        ? button.dataset.stationUrl === matchedLink.url
        : Boolean(playingUrl) &&
          this._stationIdentity(button.dataset.stationUrl) === this._stationIdentity(playingUrl);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  _styles() {
    return `
      jukebox-card,
      jukebox-card *,
      jukebox-card *::before,
      jukebox-card *::after {
        box-sizing: border-box;
      }

      jukebox-card {
        display: block;
        width: 100%;
        min-width: 0;
      }

      jukebox-card > ha-card.jukebox-card {
        display: block;
        width: 100%;
        min-width: 0;
        overflow: hidden;
      }

      .jukebox-content {
        display: block;
        width: 100%;
        min-width: 0;
      }

      .jukebox-speaker-tabs {
        display: flex;
        width: 100%;
        min-width: 0;
        min-height: 40px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        background-color: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }

      .jukebox-speaker-tabs::-webkit-scrollbar {
        display: none;
      }

      .jukebox-speaker-tab {
        position: relative;
        flex: 1 0 auto;
        min-width: 0;
        height: 48px;
        margin: 0;
        padding: 0 18px;
        border: 0;
        border-radius: 0;
        outline: 0;
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        line-height: 48px;
        text-align: center;
        white-space: nowrap;
        cursor: pointer;
        opacity: 0.78;
        -webkit-appearance: none;
        appearance: none;
      }

      .jukebox-speaker-tab.selected {
        opacity: 1;
      }

      .jukebox-speaker-tab.selected::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        background: var(--text-primary-color, #fff);
      }

      .jukebox-media-row {
        display: grid;
        grid-template-areas: 'media-row';
        align-items: stretch;
        width: 100%;
        min-width: 0;
        min-height: 40px;
      }

      .jukebox-volume,
      .jukebox-idle-status {
        grid-area: media-row;
        min-height: 40px;
      }

      .jukebox-volume {
        direction: ltr;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-3, 12px);
        width: 100%;
        min-width: 0;
        padding-inline: var(--ha-space-2, 8px);
      }

      .jukebox-idle-status {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0 16px;
        color: var(--secondary-text-color);
        opacity: 0.55;
      }

      .jukebox-idle-status ha-icon-button {
        --ha-icon-button-size: 32px;
        --mdc-icon-size: 20px;
        flex: 0 0 auto;
        color: var(--secondary-text-color);
        pointer-events: none;
      }

      .jukebox-volume-slider-container {
        width: 100%;
        min-width: 0;
      }

      .jukebox-volume-slider-container ha-slider {
        width: 100%;
        min-width: 100px;
      }

      .jukebox-volume ha-icon-button {
        --ha-icon-button-size: 32px;
        --mdc-icon-size: 20px;
        flex: 0 0 auto;
        color: var(--primary-text-color);
      }

      .jukebox-volume .jukebox-volume-indicator {
        pointer-events: none;
      }

      .jukebox-media-player {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
        padding: 2px 8px 4px;
      }

      .jukebox-media-title {
        display: flex;
        align-items: center;
        flex: 0 1 34%;
        max-width: 34%;
        min-width: 0;
        min-height: 40px;
        box-sizing: border-box;
        padding: 0 8px;
        color: var(--secondary-text-color);
        font-size: 12px;
        font-weight: 400;
        line-height: 16px;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .jukebox-media-title[hidden] {
        display: none;
      }

      .jukebox-media-player > .jukebox-media-row {
        flex: 1 1 auto;
        width: 100%;
      }

      .jukebox-media-player.with-title > .jukebox-media-row {
        flex: 1 1 0;
        width: auto;
      }

      .jukebox-station-list {
        display: flex;
        flex-flow: row wrap;
        align-items: stretch;
        width: 100%;
        min-width: 0;
        padding: 0 8px 10px;
        gap: 0;
      }

      .jukebox-station-list.fixed-columns {
        display: grid;
        grid-template-columns: repeat(var(--jukebox-columns), minmax(0, 1fr));
        align-items: stretch;
        width: 100%;
        padding: 4px 8px 10px;
        gap: 4px;
      }

      .jukebox-station-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        height: 40px;
        min-width: 64px;
        max-width: 100%;
        margin: 0;
        padding: 0 12px;
        border: 0;
        border-radius: 2px;
        outline: 0;
        background: transparent;
        color: var(--primary-text-color);
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        line-height: 40px;
        text-align: center;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
      }

      .jukebox-station-button:hover {
        background: var(--secondary-background-color);
      }

      .jukebox-station-button.active {
        background-color: var(--primary-color);
        color: var(--text-primary-color, #fff);
        box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14),
                    0 3px 1px -2px rgba(0, 0, 0, 0.12),
                    0 1px 5px 0 rgba(0, 0, 0, 0.20);
      }

      .jukebox-station-list.fixed-columns .jukebox-station-button {
        width: 100%;
        min-width: 0;
      }

      .jukebox-error {
        padding: 16px;
        color: var(--error-color, #db4437);
      }

      jukebox-card [hidden] {
        display: none !important;
      }

      @media (max-width: 420px) {
        .jukebox-speaker-tab {
          padding: 0 12px;
          font-size: 13px;
        }

        .jukebox-station-list,
        .jukebox-station-list.fixed-columns {
          padding-left: 6px;
          padding-right: 6px;
        }

        .jukebox-station-button {
          padding: 0 8px;
          font-size: 13px;
        }
      }
    `;
  }
}

if (!customElements.get('jukebox-card')) {
  customElements.define('jukebox-card', JukeboxCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'jukebox-card')) {
  window.customCards.push({
    type: 'jukebox-card',
    name: 'Jukebox Card',
    preview: false,
    description: 'Jukebox Card for Home Assistant.',
  });
}

/* global console */
/* global window */
/* global localStorage */
/* global Event */
/* global CustomEvent */
/* global Autodesk */

class Configurator extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.viewer = viewer;
    this.createToolbarButton;
    this.panel = null;
    this.CONFIGURATOR_DATA_UPDATE = 'configuratorDataUpdate'
    this.CONFIGURATOR_DATA_CHANGED = 'configuratorDataChanged'
    this.CONFIGURATION_CHANGED_EVENT = 'configurationChanged'
  }

  load() {
    if (this.viewer.toolbar) {
      // Toolbar is already available, create the UI
      this.createUI();
    } else {
      // Toolbar hasn't been created yet, wait until we get notification of its creation
      this.onToolbarCreatedBinded = this.onToolbarCreated.bind(this);
      this.viewer.addEventListener(this.viewer.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
    }
    window.addEventListener(this.CONFIGURATOR_DATA_UPDATE, (event) => {
      this.setConfiguratorDB(event);
    });
    window.addEventListener(this.CONFIGURATION_CHANGED_EVENT, (event) => {
      this.handleConfigurationChange(event);
    });
    console.log('Configurator Loaded!')
    return true;
  }

  unload() {
    this.viewer.toolbar.removeControl(this.subToolbar);
    return true;
  }

  static get ExtensionId() {
    return 'Configurator.Extension.Configurator';
  }

  setConfiguratorDB(event) {
    localStorage.setItem('configuratorData', JSON.stringify(event.detail));
    window.dispatchEvent(new Event(this.CONFIGURATOR_DATA_CHANGED));
  }

  createUI() {
    const buttonName = 'configurator-configuration-button';
    const button1 = new Autodesk.Viewing.UI.Button(buttonName);
    button1.onClick = () => {
      this.showDockingPanel();
    };
    button1.addClass('configurator-configuration-button');
    button1.setToolTip('Configure');

    const toolbarName = 'configurator-toolbar';
    this.subToolbar = new Autodesk.Viewing.UI.ControlGroup(toolbarName);
    this.subToolbar.addControl(button1);

    this.viewer.toolbar.addControl(this.subToolbar);
  }

  onToolbarCreated() {
    this.viewer.removeEventListener(this.viewer.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
    this.onToolbarCreatedBinded = null;
    this.createUI();
  }

  showDockingPanel() {
    if (this.panel == null) {
      this.panel = new ConfiguratorConfigurationPanel(
          this.viewer.container,
          'configuratorConfigurationPanel',
          'Configuration Browser',
          null,
          null,
          this.viewer,
          this
      );
    }

    // show/hide docking panel
    this.panel.setVisible(!this.panel.isVisible());
  }


  /**
   * When the configuration is changed,
   * we'll federate the new Assembly Code
   * and find the corresponding DbId
   */
  handleConfigurationChange(event) {
    const configurationCode = event.detail;
    let configuratorData = localStorage.getItem('configuratorData');
    if (!configuratorData) {
      return;
    } else {
      configuratorData = JSON.parse(configuratorData);


      // Assembly Code -> ExternalId (UniqueId)
      const configuratorMapping = configuratorData.configurationMapping;
      const uniqueId = configuratorMapping[configurationCode];
      if (uniqueId) {
        this.configureElementByUniqueId(uniqueId);
      }
    }
  }

  // ExternalId -> DbId
  configureElementByUniqueId(uniqueId) {
    this.viewer.model.getExternalIdMapping((mapping) => {
      this.configureElementByUniqueIdAndMapping(uniqueId, mapping);
    });
  }

  configureElementByUniqueIdAndMapping(uniqueId, mapping) {
    // ExternalId -> DbId
    const elementDbId = mapping[uniqueId];
    if (elementDbId) {
      this.viewer.isolate(elementDbId);
      this.viewer.fitToView(elementDbId);
    }
  }
}

class ConfiguratorConfigurationPanel extends Autodesk.Viewing.UI.DockingPanel {
  constructor(viewerContainer, container, id, title, options, viewer, configurator) {
    super(viewerContainer, container, id, title, options);
    this.configurator = configurator;
    this.viewer = viewer;
    this.create();
  }

  create() {
    // the style of the docking panel
    // use this built-in style to support Themes on Viewer 4+
    this.container.classList.add('docking-panel-container-solid-color-a');
    this.container.style.top = '10px';
    this.container.style.left = '10px';
    this.container.style.width = '350';
    this.container.style.height = '400';
    this.container.style.resize = 'auto';

    this.createConfiguratorControlsArea();
    this.updateControls();

    window.addEventListener(this.configurator.CONFIGURATOR_DATA_CHANGED, () => {
      this.updateControls();
    });
  }

  createConfiguratorControlsArea() {
    const $controlsTable = $('<table>', {
      id: 'configurator-configuration-area',
      class: 'docking-panel-scroll',
    });
    const $controlsList = $('<tbody>', {
      id: 'overall-controls-body',
    });

    $controlsList.appendTo($controlsTable);

    // Add controls area to the Forge UI Panel
    this.container.appendChild($controlsTable[0]);
  }

  updateControls() {
    const configuratorDataDB = localStorage.getItem('configuratorData');
    if (!configuratorDataDB) {
      return;
    } else {
      const configuratorData = JSON.parse(configuratorDataDB);
      const controlsData = configuratorData.controls;
      const controls = this.createControls(controlsData);
      this.setPanelControls(controls);
      this.setControlChangedEvents();
      this.controlsChangedEvent();
    }
  }

  createControls(controlsData) {
    return controlsData.map((controlData) => {
      const name = controlData.name;
      const options = controlData.options;
      const controlRow = this.createControlRow(name);
      this.addDropdownToControl(controlRow, options);
      return controlRow;
    });
  }

  createControlRow(name) {
    const controlRow = $('<tr>', {
      class: 'control-row'
    });
    const controlLabel = $('<td>', {
      class: 'control-label',
      text: name + ': '
    });
    controlLabel.appendTo(controlRow);
    return controlRow;
  }

  addDropdownToControl(controlRow, options) {
    const controlDropdownData = $('<td>', {
      class: 'control-row-data'
    });
    const controlDropdown = $('<select>', {
      class: 'configurator-control'
    });
    options.forEach((option) => {
      const optionElement = $('<option>', {
        value: option.value,
        text: option.text
      });
      optionElement.appendTo(controlDropdown);
    });

    controlDropdown.appendTo(controlDropdownData);
    controlDropdownData.appendTo(controlRow);
  }

  setPanelControls(controls) {
    const currentControlsArea = $('#overall-controls-body')
    currentControlsArea.children().remove();
    controls.forEach((control) => {
      const controlRow = $('<tr>', {
        class: 'control-row'
      });
      const controlRowData = $('<td>', {
        class: 'control-row-data'
      });
      control.appendTo(controlRowData);
      controlRowData.appendTo(controlRow);
      controlRow.appendTo(currentControlsArea);
    });
  }

  setControlChangedEvents() {
    $('.configurator-control').on('change', () => {
      this.controlsChangedEvent();
    });
  }

  controlsChangedEvent() {
    const configurationCodeComponents = [];
    $('.configurator-control').each((index, control) => {
      configurationCodeComponents.push($(control).val());
    });
    const configurationCode = configurationCodeComponents.join('-');
    window.dispatchEvent(new CustomEvent(this.configurator.CONFIGURATION_CHANGED_EVENT, { 'detail': configurationCode }));
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension(
    Configurator.ExtensionId,
    Configurator
);
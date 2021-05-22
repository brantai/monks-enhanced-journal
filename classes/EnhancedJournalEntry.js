import { DCConfig } from "../apps/dc-config.js";
import { SlideConfig } from "../apps/slideconfig.js";
import { TrapConfig } from "../apps/trap-config.js";
import { i18n, log, makeid, MonksEnhancedJournal } from "../monks-enhanced-journal.js";

export class SubSheet {
    constructor(object) {
        this.object = object;
        this.refresh();
    }

    static get defaultOptions() {
        return {
            text: "MonksEnhancedJournal.NewTab",
            template: "modules/monks-enhanced-journal/templates/blank.html"
        };
    }

    get type() {
        return 'blank';
    }

    refresh() {
        try {
            this.object.data.content = JSON.parse(this.object.data.content);
        } catch (err) {
        }
    }

    getData(data) {
        if (data == undefined)
            data = duplicate(this.object.data);

        data.userid = game.user.id;

        if (data.content[game.user.id])
            data.userdata = data.content[game.user.id];

        return data;
    }

    async render(data) {
        let templateData = this.getData(data);

        let html = await renderTemplate(this.constructor.defaultOptions.template, templateData);
        this.element = $(html).get(0);

        this.activateListeners($(this.element));

        return this.element;
    }

    activateListeners(html) {
        if (this.object.sheet) {
            if (!this.object?.sheet?.isEditable) {
                this.object.sheet._disableFields(html);
                $('textarea[name="userdata.notes"]', html).removeAttr('disabled').on('change', $.proxy(this.object.sheet._onChangeInput, this.object.sheet));
            }

            html.on("change", "input,select,textarea", this.object.sheet?._onChangeInput.bind(this.object.sheet));
            html.find('.editor-content[data-edit]').each((i, div) => this.object.sheet?._activateEditor(div));
            html.find('button.file-picker').each((i, button) => this.object.sheet?._activateFilePicker(button));
            html.find('img[data-edit]').click(ev => {
                this.object.sheet?._onEditImage(ev)
            });
        }
    }

    activateControls(html) {
        let ctrls = this._entityControls;
        Hooks.callAll('activateControls', this, ctrls);
        if (ctrls) {
            for (let ctrl of ctrls) {
                if (ctrl.conditional != undefined) {
                    if (typeof ctrl.conditional == 'function') {
                        if (!ctrl.conditional.call(this))
                            continue;
                    }
                    else if (!ctrl.conditional)
                        continue;
                }
                let div = '';
                switch (ctrl.type || 'button') {
                    case 'button':
                        div = $('<div>')
                                .addClass('nav-button ' + ctrl.id)
                                .attr('title', ctrl.text)
                                .append($('<i>').addClass('fas ' + ctrl.icon))
                                .on('click', $.proxy(ctrl.callback, this.object.sheet));
                        break;
                    case 'input':
                        div = $('<input>').addClass('nav-input ' + ctrl.id).attr(mergeObject({ 'type': 'text', 'autocomplete': 'off', 'placeholder': ctrl.text }, (ctrl.attributes || {})));
                        break;
                    case 'text':
                        div = $('<div>').addClass('nav-text ' + ctrl.id).html(ctrl.text);
                        break;
                }

                if (div != '') {
                    if (ctrl.visible === false)
                        div.hide();
                    html.append(div);
                }
                //<div class="nav-button search" title="Search"><i class="fas fa-search"></i><input class="search" type="text" name="search-entry" autocomplete="off"></div>
            }
        }
    }

    get _entityControls() {
        return [];
    }

    onEditDescription() {
            if (this.object.permission < ENTITY_PERMISSIONS.OWNER)
            return null;

        if ($('div.tox-tinymce', this.element).length > 0) {
            //close the editor
            const name = $('.editor-content', this.element).attr("data-edit");
            //this.saveEditor(name);
            const editor = this.editors[name];
            if (!editor || !editor.mce) throw new Error(`${name} is not an active editor name!`);
            editor.active = false;
            const mce = editor.mce;

            const submit = this._onSubmit(new Event("mcesave"));

            mce.remove();
            if (editor.hasButton) editor.button.style.display = "";

            return submit.then(() => {
                mce.destroy();
                editor.mce = null;
                this.render(true, { action:'update', data: {content: editor.initial, _id: this.object.id}}); //need to send this so that the render looks to the subsheet instead
                editor.changed = false;
                $('.sheet-body', this.element).removeClass('editing');
            });            
        } else {
            $('.editor .editor-edit', this.element).click();
            //$('.sheet-body', this.element).addClass('editing');
        }
    }
}

export class ActorSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.actor",
            template: ""
        });
    }

    get type() {
        return 'actor';
    }

    async render(data) {
        if (data == undefined)
            data = duplicate(this.object.data);

        const sheet = this.object.sheet;
        await sheet._render(true);
        $(sheet.element).hide();

        let body = $('<div>').addClass(sheet.options.classes).append($('.window-content', sheet.element));

        this.activateListeners($(sheet.element));

        this.element = body.get(0);
        return this.element;
    }

    activateListeners(html) {
        super.activateListeners(html);

        $('img[data-edit]', html).on('click', $.proxy(this._onEditImage, this))
        let editor = $(".editor-content", html).get(0);
        if (editor != undefined)
            this._activateEditor(editor);
    }
}

export class EncounterSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.encounter",
            template: "modules/monks-enhanced-journal/templates/encounter.html"
        });
    }

    get type() {
        return 'encounter';
    }

    getData(data) {
        data = super.getData(data);

        let config = (game.system.id == "tormenta20" ? CONFIG.T20 : CONFIG[game.system.id.toUpperCase()]);

        for (let dc of data.content.dcs) {
            dc.label = config.abilities[dc.attribute] || config.skills[dc.attribute] || config.scores[dc.attribute] || config.atributos[dc.attribute] || config.pericias[dc.attribute] || dc.attribute;
        }

        return data;
    }

    get _entityControls() {
        return [
            { id: 'search', text: 'Search', icon: 'fa-search', callback: function () { } },
            { id: 'show', text: 'Show to Players', icon: 'fa-eye', conditional: game.user.isGM, callback: this.object.sheet._onShowPlayers },
            { id: 'edit', text: 'Edit Description', icon: 'fa-pencil-alt', conditional: () => { return this.object.permission == ENTITY_PERMISSIONS.OWNER }, callback: this.onEditDescription }
        ];
    }

    activateListeners(html) {
        super.activateListeners(html);

        new ResizeObserver(function (obs) {
                log('resize observer', obs);
                $(obs[0].target).toggleClass('condensed', obs[0].contentRect.width < 900);
        }).observe($('.encounter-content', html).get(0));

        //monster
        $('.monster-icon', html).click(this.clickItem.bind(this));
        $('.monster-delete', html).on('click', $.proxy(this.deleteItem, this));
        html.on('dragstart', ".monster-icon", TextEditor._onDragEntityLink);

        //item
        $('.item-icon', html).click(this.clickItem.bind(this));
        $('.item-delete', html).on('click', $.proxy(this.deleteItem, this));

        //DCs
        $('.dc-create', html).on('click', $.proxy(this.createDC, this));
        $('.dc-edit', html).on('click', $.proxy(this.editDC, this));
        $('.dc-delete', html).on('click', $.proxy(this.deleteItem, this));
        $('.encounter-dcs .item-name', html).on('click', $.proxy(this.rollDC, this));

        //Traps
        $('.trap-create', html).on('click', $.proxy(this.createTrap, this));
        $('.trap-edit', html).on('click', $.proxy(this.editTrap, this));
        $('.trap-delete', html).on('click', $.proxy(this.deleteItem, this));
        $('.encounter-traps .item-name', html).on('click', $.proxy(this.rollTrap, this));
    }

    async addMonster(data) {
        let actor;
        if (data.pack) {
            const pack = game.packs.get(data.pack);
            let id = data.id;
            if (data.lookup) {
                if (!pack.index.length) await pack.getIndex();
                const entry = pack.index.find(i => (i._id === data.lookup) || (i.name === data.lookup));
                id = entry._id;
            }
            actor = id ? await pack.getEntity(id) : null;
        } else {
            const cls = CONFIG[data.type].entityClass;
            actor = cls.collection.get(data.id);
            if (actor.entity === "Scene" && actor.journal) actor = actor.journal;
            if (!actor.hasPerm(game.user, "LIMITED")) {
                return ui.notifications.warn(`You do not have permission to view this ${actor.entity} sheet.`);
            }
        }

        if (this.object.data.content.monsters == undefined)
            this.object.data.content.monsters = [];
        let monster = {
            id: actor.id,
            img: actor.img,
            name: actor.name
        };

        if (data.pack)
            monster.pack = data.pack;

        this.object.data.content.monsters.push(monster);
        this.object.sheet.saveData();
    }

    deleteMonster(event) {
        let item = event.currentTarget.closest('.item');
        if (this.object.data.content.dcs.findSplice(dc => dc.id == item.dataset.id));
        $(item).remove();
    }

    addItem(data) {
        let item = game.items.get(data.id);

        if (this.object.data.content.items == undefined)
            this.object.data.content.items = [];

        let newitem = {
            id: item.id,
            img: item.img,
            name: item.name,
            qty: 1
        };

        if (data.pack)
            newitem.pack = data.pack;

        this.object.data.content.items.push(newitem);
        this.object.sheet.saveData();
    }

    clickItem(event) {
        let target = event.currentTarget;
        let li = target.closest('li');
        event.currentTarget = li;
        TextEditor._onClickEntityLink(event);
    }

    deleteItem(data) {
        let item = event.currentTarget.closest('.item');
        if (this.object.data.content[item.dataset.container].findSplice(i => i.id == item.dataset.id));
        $(item).remove();
    }

    createDC() {
        let dc = { id: makeid(), dc:10 };
        if (this.object.data.content.dcs == undefined)
            this.object.data.content.dcs = [];
        this.object.data.content.dcs.push(dc);
        new DCConfig(dc).render(true);
    }

    editDC(event) {
        let item = event.currentTarget.closest('.item');
        let dc = this.object.data.content.dcs.find(dc => dc.id == item.dataset.id);
        if(dc != undefined)
            new DCConfig(dc).render(true);
    }

    rollDC(event) {
        let item = event.currentTarget.closest('.item');
        let dc = this.object.data.content.dcs.find(dc => dc.id == item.dataset.id);

        let config = (game.system.id == "tormenta20" ? CONFIG.T20 : CONFIG[game.system.id.toUpperCase()]);
        let dctype = 'ability';
        //if (config?.skills[dc.attribute] || config?.pericias[dc.attribute] != undefined)
        //    dctype = 'skill';

        if (game.modules.get("monks-tokenbar")?.active && setting('rolling-module') == 'monks-tokenbar') {
            game.MonksTokenBar.requestRoll(canvas.tokens.controlled, { request: `${dctype}:${dc.attribute}`, dc: dc.dc });
        }
    }

    createTrap() {
        let trap = { id: makeid() };
        if (this.object.data.content.traps == undefined)
            this.object.data.content.traps = [];
        this.object.data.content.traps.push(trap);
        new TrapConfig(trap).render(true);
    }

    editTrap(event) {
        let item = event.currentTarget.closest('.item');
        let trap = this.object.data.content.traps.find(dc => dc.id == item.dataset.id);
        if (trap != undefined)
            new TrapConfig(trap).render(true);
    }

    rollTrap(event) {

    }
}

export class JournalEntrySubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    get type() {
        return 'journalentry';
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.journalentry",
            template: "modules/monks-enhanced-journal/templates/journalentry.html"
        });
    }

    get _entityControls() {
        return [
            { text: '<i class="fas fa-search"></i>', type: 'text' },
            { id: 'search', type:'input' },
            { id: 'show', text: 'Show to Players', icon: 'fa-eye', conditional: game.user.isGM, callback: this.object.sheet._onShowPlayers },
            { id: 'edit', text: 'Edit Description', icon: 'fa-pencil-alt', conditional: () => { return this.object.permission == ENTITY_PERMISSIONS.OWNER }, callback: this.onEditDescription }
        ];
    }

    refresh() {
        super.refresh();

        const owner = this.object.owner;
        const content = TextEditor.enrichHTML(this.object.data.content, { secrets: owner, entities: true });

        $('.editor-content[data-edit="content"]').html(content);
    }
}

export class PersonSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.person",
            template: "modules/monks-enhanced-journal/templates/person.html"
        });
    }

    get type() {
        return 'person';
    }

    get _entityControls() {
        return [
            { text: '<i class="fas fa-search"></i>', type: 'text' },
            { id: 'search', type: 'input', text: 'Search Player Description' },
            { id: 'show', text: 'Show to Players', icon: 'fa-eye', conditional: game.user.isGM, callback: this.object.sheet._onShowPlayers },
            { id: 'edit', text: 'Edit Description', icon: 'fa-pencil-alt', conditional: () => { return this.object.permission == ENTITY_PERMISSIONS.OWNER }, callback: this.onEditDescription }
        ];
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.object.sheet.sheettabs.bind(html[0]);
    }

    refresh() {
        super.refresh();

        const owner = this.object.owner;
        const content = TextEditor.enrichHTML(this.object.data.content.summary, { secrets: owner, entities: true });

        $('.editor-content[data-edit="content.summary"]', this.object.sheet.element).html(content);
    }
}

export class PictureSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.picture",
            template: "modules/monks-enhanced-journal/templates/picture.html"
        });
    }

    get type() {
        return 'picture';
    }

    get _entityControls() {
        return [
            { id: 'show', text: 'Show to Players', icon: 'fa-eye', conditional: game.user.isGM, callback: this.object.sheet._onShowPlayers }
        ];
    }
}

export class PlaceSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.place",
            template: "modules/monks-enhanced-journal/templates/place.html"
        });
    }

    get type() {
        return 'place';
    }

    get _entityControls() {
        return [
            { id: 'show', text: 'Show to Players', icon: 'fa-eye', conditional: game.user.isGM, callback: this.object.sheet._onShowPlayers },
            { id: 'edit', text: 'Edit Description', icon: 'fa-pencil-alt', conditional: () => { return this.object.permission == ENTITY_PERMISSIONS.OWNER }, callback: this.onEditDescription }
        ];
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.object.sheet.sheettabs.bind(html[0]);
    }

    refresh() {
        super.refresh();

        const owner = this.object.owner;
        const content = TextEditor.enrichHTML(this.object.data.content.summary, { secrets: owner, entities: true });

        $('.editor-content[data-edit="content.summary"]', this.object.sheet.element).html(content);
    }
}

export class QuestSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.quest",
            template: "modules/monks-enhanced-journal/templates/quest.html"
        });
    }

    get type() {
        return 'quest';
    }

    get _entityControls() {
        return [
            { id: 'show', text: 'Show to Players', icon: 'fa-eye', conditional: game.user.isGM, callback: this.object.sheet._onShowPlayers },
            { id: 'edit', text: 'Edit Description', icon: 'fa-pencil-alt', conditional: () => { return this.object.permission == ENTITY_PERMISSIONS.OWNER }, callback: this.onEditDescription }
        ];
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.object.sheet.sheettabs.bind(html[0]);
    }

    refresh() {
        super.refresh();

        const owner = this.object.owner;
        const content = TextEditor.enrichHTML(this.object.data.content.summary, { secrets: owner, entities: true });

        $('.editor-content[data-edit="content.summary"]', this.object.sheet.element).html(content);
    }
}

export class SlideshowSubSheet extends SubSheet {
    constructor(data, options) {
        super(data, options);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            text: "MonksEnhancedJournal.slideshow",
            template: "modules/monks-enhanced-journal/templates/slideshow.html"
        });
    }

    get type() {
        return 'slideshow';
    }

    getData(data) {
        data = super.getData(data);
        data.showasOptions = { canvas: "Canvas", fullscreen: "Full Screen", window: "Window" };

        let idx = 0;
        for (let slide of data.content.slides) {
            if (slide.background?.color == '')
                slide.background = `background-image:url(\'${slide.img}\');`;
            else
                slide.background = `background-color:${slide.background.color}`;

            slide.textbackground = hexToRGBAString(colorStringToHex(slide.text?.background || '#000000'), 0.5);

            slide.topText = (slide.text?.valign == 'top' ? slide.text?.content : '');
            slide.middleText = (slide.text?.valign == 'middle' ? slide.text?.content : '');
            slide.bottomText = (slide.text?.valign == 'bottom' ? slide.text?.content : '');

            slide.active = (idx == this.object.data.content.slideAt);

            idx++;
        }

        if (this.object.data.content.playing) {
            data.slideshowing = this.object.data.content.slides[this.object.data.content.slideAt];

            if (data.slideshowing.background?.color == '')
                data.slideshowing.background = `background-image:url(\'${data.slideshowing.img}\');`;
            else
                data.slideshowing.background = `background-color:${data.slideshowing.background.color}`;

            data.slideshowing.textbackground = hexToRGBAString(colorStringToHex(data.slideshowing.text?.background || '#000000'), 0.5);

            data.slideshowing.topText = (data.slideshowing.text?.valign == 'top' ? data.slideshowing.text?.content : '');
            data.slideshowing.middleText = (data.slideshowing.text?.valign == 'middle' ? data.slideshowing.text?.content : '');
            data.slideshowing.bottomText = (data.slideshowing.text?.valign == 'bottom' ? data.slideshowing.text?.content : '');

            if (data.slideshowing.transition?.duration > 0) {
                let time = data.slideshowing.transition.duration * 1000;
                let timeRemaining = time - ((new Date()).getTime() - data.slideshowing.transition.startTime);
                data.slideshowing.durprog = (timeRemaining / time) * 100;
            }else
                data.slideshowing.durlabel = i18n("MonksEnhancedJournal.ClickForNext");
        }

        return data;
    }

    get _entityControls() {
        return [
            { id: 'add', text: 'Add Slide', icon: 'fa-plus', conditional: game.user.isGM, callback: this.addSlide },
            { id: 'clear', text: 'Clear All', icon: 'fa-dumpster', conditional: game.user.isGM, callback: this.deleteAll },
            { id: 'play', text: 'Play', icon: 'fa-play', conditional: game.user.isGM, visible: !this.object.data.content.playing, callback: this.playSlideshow },
            { id: 'stop', text: 'Play', icon: 'fa-stop', conditional: game.user.isGM, visible: this.object.data.content.playing, callback: this.stopSlideshow }
        ];
    }

    activateListeners(html) {
        super.activateListeners(html);

        const slideshowOptions = this._getSlideshowContextOptions();
        Hooks.call(`getMonksEnhancedJournalSlideshowContext`, html, slideshowOptions);
        if (slideshowOptions) new ContextMenu($(html), ".slideshow-body .slide", slideshowOptions);

        html.find('.slideshow-body .slide').click(this.activateSlide.bind(this));
        html.find('.slide-showing').click(this.advanceSlide.bind(this, 1)).contextmenu(this.advanceSlide.bind(this, -1));
    }

    addSlide(data = {}, options = { showdialog: true }) {
        if (this.object.data.content.slides == undefined)
            this.object.data.content.slides = [];

        let slide = mergeObject({
            sizing: 'contain',
            background: { color: '' },
            text: { color: '#FFFFFF', background: '#000000', align: 'center', valign: 'middle' },
            transition: { duration: 5, effect: 'fade' }
        }, data);
        slide.id = makeid();
        this.object.data.content.slides.push(slide);

        MonksEnhancedJournal.createSlide(slide, $('.slideshow-body', this.element));

        if (options.showdialog)
            new SlideConfig(slide).render(true);
    }

    deleteAll() {
        this.object.data.content.slides = [];
        $(`.slideshow-body`, this.element).empty();
        this.object.sheet.saveData();
    }

    deleteSlide(id, html) {
        this.object.data.content.slides.findSplice(s => s.id == id);
        $(`.slide[data-slide-id="${id}"]`, this.element).remove();
        this.object.sheet.saveData();
    }

    cloneSlide(id) {
        let slide = this.object.data.content.slides.find(s => s.id == id);
        let data = duplicate(slide);
        this.addSlide(data, { showdialog: false });
    }

    editSlide(id, options) {
        let slide = this.object.data.content.slides.find(s => s.id == id);
        if (slide != undefined)
            new SlideConfig(slide, options).render(true);
    }

    activateSlide(event) {
        if (this.object.data.content.playing) {
            let idx = $(event.currentTarget).index();
            this.playSlide(idx);
        }
    }

    playSlideshow(refresh = true) {
        this.object.data.content.playing = true;
        this.object.data.content.slideAt = 0;
        this.object.data.content.sound = undefined;

        $('.slide-showing .duration', this.element).show();
        $('.slideshow-container', this.element).toggleClass('playing', this.object.data.content.playing);
        $('.navigation .play', this.element).toggle(!this.object.data.content.playing);
        $('.navigation .stop', this.element).toggle(this.object.data.content.playing);

        if (this.object.data.content.audiofile != undefined && this.object.data.content.audiofile != '')
            this.object.data.content.sound = AudioHelper.play({ src: this.object.data.content.audiofile }, true);

        //inform players
        game.socket.emit(
            MonksEnhancedJournal.SOCKET,
            {
                action: 'playSlideshow',
                args: { id: this.object.id, idx: 0 }
            }
        );

        if (this.object.data.content.playing) {
            if (refresh)
                $('.slide-showing .slide', this.element).remove();
            this.subsheet.playSlide(0);
        }
    }

    stopSlideshow() {
        this.object.data.content.playing = false;
        this.object.data.content.slideAt = 0;
        $('.slide-showing .slide', this.element).remove();
        $('.slide-showing .duration', this.element).hide();
        $('.slideshow-container', this.object.sheet.element).toggleClass('playing', this.object.data.content.playing);
        $('.navigation .play', this.object.sheet.element).toggle(!this.object.data.content.playing);
        $('.navigation .stop', this.object.sheet.element).toggle(this.object.data.content.playing);

        if (this.object.data.content?.sound?._src != undefined) {
            game.socket.emit("stopAudio", { src: this.object.data.content.audiofile });
            this.object.data.content.sound.stop();
            this.object.data.content.sound = undefined;
        }

        //inform players
        game.socket.emit(
            MonksEnhancedJournal.SOCKET,
            {
                action: 'stopSlideshow',
                args: { }
            }
        );
    }

    playSlide(idx, animate = true) {
        let slide = this.object.data.content.slides[idx];

        //remove any that are still on the way out
        $('.slide-showing .slide.out', this.element).remove();

        //remove any old slides
        let oldSlide = $('.slide-showing .slide', this.element);
        oldSlide.addClass('out').animate({ opacity: 0 }, 1000, 'linear', function () { $(this).remove() });

        //bring in the new slide
        let newSlide = MonksEnhancedJournal.createSlide(slide, $('.slide-showing', this.element));
        newSlide.css({ opacity: 0 }).animate({ opacity: 1 }, 1000, 'linear');

        /*
        let background = '';

        this.object.data.content.slideAt = idx;

        if (slide.background?.color == '')
            background = `background-image:url(\'${slide.img}\');`;
        else
            background = `background-color:${slide.background?.color}`;

        let textBackground = hexToRGBAString(colorStringToHex(slide.text?.background || '#000000'), 0.5);

        let slideShowing = $('.slide-showing', this.element);
        $('.slide-background > div', slideShowing).attr({ style: background });
        $('.slide > img', slideShowing).attr('src', slide.img).css({ 'object-fit': (slide.sizing || 'contain') });
        $('.slide-text > div', slideShowing).css({ 'text-align': slide.text?.align, color: slide.text?.color });
        $('.text-upper > div', slideShowing).css({ 'background-color': textBackground }).html(slide.text?.valign == 'top' ? slide.text?.content : '');
        $('.text-middle > div', slideShowing).css({ 'background-color': textBackground }).html(slide.text?.valign == 'middle' ? slide.text?.content : '');
        $('.text-lower > div', slideShowing).css({ 'background-color': textBackground }).html(slide.text?.valign == 'bottom' ? slide.text?.content : '');
        */

        $(`.slideshow-body .slide:eq(${idx})`, this.element).addClass('active').siblings().removeClass('active');
        $('.slideshow-body', this.element).scrollLeft((idx * 116));
        $('.slide-showing .duration', this.element).empty();

        window.clearTimeout(slide.transition.timer);

        if (slide.transition?.duration > 0) {
            //set up the transition
            let time = slide.transition.duration * 1000;
            slide.transition.startTime = (new Date()).getTime();
            slide.transition.timer = window.setTimeout(this.advanceSlide.bind(this, 1), time);
            $('.slide-showing .duration', this.element).append($('<div>').addClass('duration-bar').css({ width: '0' }).show().animate({width: '100%'}, time, 'linear'));
        } else {
            $('.slide-showing .duration', this.element).append($('<div>').addClass('duration-label').html(i18n("MonksEnhancedJournal.ClickForNext")));
        }

        game.socket.emit(
            MonksEnhancedJournal.SOCKET,
            {
                action: 'playSlide',
                args: {
                    id: this.object.id,
                    idx: idx
                }
            }
        );
    }

    advanceSlide(dir, event) {
        this.object.data.content.slideAt = this.object.data.content.slideAt + dir;
        if (this.object.data.content.slideAt < 0)
            this.object.data.content.slideAt = 0;
        else if (this.object.data.content.slideAt >= this.object.data.content.slides.length)
            this.stopSlideshow();
        else
            this.playSlide(this.object.data.content.slideAt, dir > 0);
    }

    _getSlideshowContextOptions() {
        return [
            {
                name: "Edit Slide",
                icon: '<i class="fas fa-edit"></i>',
                condition: game.user.isGM,
                callback: li => {
                    const id = li.data("slideId");
                    //const slide = this.object.data.content.slides.get(li.data("entityId"));
                    //const options = { top: li[0].offsetTop, left: window.innerWidth - SlideConfig.defaultOptions.width };
                    this.editSlide(id); //, options);
                }
            },
            {
                name: "SIDEBAR.Duplicate",
                icon: '<i class="far fa-copy"></i>',
                condition: () => game.user.isGM,
                callback: li => {
                    const id = li.data("slideId");
                    //const slide = this.object.data.content.slides.get(li.data("entityId"));
                    return this.cloneSlide(id);
                }
            },
            {
                name: "SIDEBAR.Delete",
                icon: '<i class="fas fa-trash"></i>',
                condition: () => game.user.isGM,
                callback: li => {
                    const id = li.data("slideId");
                    //const slide = this.object.data.content.slides.get(li.data("entityId"));
                    Dialog.confirm({
                        title: `${game.i18n.localize("SIDEBAR.Delete")} slide`,
                        content: game.i18n.localize("SIDEBAR.DeleteConfirm"),
                        yes: this.deleteSlide.bind(this, id),
                        options: {
                            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720
                        }
                    });
                }
            }
        ];
    }
}
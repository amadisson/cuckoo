/*
 * Copyright (C) 2010-2013 Claudio Guarnieri.
 * Copyright (C) 2014-2016 Cuckoo Foundation.
 * This file is part of Cuckoo Sandbox - http://www.cuckoosandbox.org
 * See the file 'docs/LICENSE' for copying permission.
 *
 */

class FileTree {
    constructor(target, data, sflock, draw_callback) {
        this.sel_target = target;
        this.data = data;
        this._draw_callback = draw_callback;
        this._convert_from_sflock = sflock;

        this._filters = {
            simplify_mime: true,
            simplify_magic: true,
            simplify_sizes: true,
            deselect_duplicates: true
        };

        this.stats = {
            duplicates: 0,
            files: 0,
            containers: 0,
            directories: 0,
            executables: 0
        };
    }

    /**
     * Draws the table
     */
    draw(){
        if (!this.sel_target) throw "drawtarget needed";

        this._init();
        this._draw_callback();
    }

    refresh(){
        this._reset_stats();
        let data = null;

        if(this._convert_from_sflock) {
            data = this._convert_sflock();
        } else {
            data = this.data;
        }

        $(this.sel_target).jstree(true).settings.core.data = data;
        $(this.sel_target).jstree(true).refresh();

        this._draw_callback();
    }

    /**
     * Init the table
     */
    _init(){
        let data = null;

        if(this._convert_from_sflock) {
            data = this._convert_sflock();
        } else {
            data = this.data;
        }
        
        let theme_active = Cookies.get("theme");
        let themes = {"name": "default"};

        if(theme_active == "night"){
            themes["name"] = "default-dark"
        }

        $(this.sel_target).jstree({
            core: {
                data: data,
                "multiple" : true,
                "animation" : 0,
                "themes": themes
            },
            types: {
                "container": {
                    "icon": "fa fa-file-archive-o"
                },
                "file": {
                    "icon": "fa fa-file-o"
                },
                "exec": {
                    "icon": "fa fa-file-text"
                },
                "office": {
                    "icon": "fa fa-file-word-o"
                },
                "duplicate": {
                    "icon": "fa fa-ban"
                }
            },
            grid: {
                columns: [
                    {width: "auto", header: "File"},
                    {width: "auto", header: "Mime", value: "mime"},
                    {width: "auto", header: "Size", value: "size"},
                    {width: "10px", header: "Magic", value: "magic"}
                ],
                resizable: true
            },
            plugins: ["themes", "types", "checkbox", "grid", "wholerow"]
        });

        $(this.sel_target).bind("ready.jstree", function(){
            let sel_wrapper = $(".jstree-grid-wrapper");
            sel_wrapper.css("min-height", sel_wrapper.outerHeight());
        });
    }

    /**
     * Convert data from the `sflock` format to JSTree
     * @private
     */
    _convert_sflock(){
        let data = $.extend({}, this.data);  //shallow copy

        let data_tmp = [];
        for (let key in data) {
            if (data.hasOwnProperty(key)) {
                let converted = this._convert_entry(data[key]);
                data_tmp.push(converted);
            }
        }

        return data_tmp;
    }

    _convert_entry(entry){
        let _self = this;

        // Temporary object
        let obj = {
            filepath: entry.filepath,
            filename: entry.filename,
            type: entry.type,
            state: false, // pre-selected tree item
            size: entry.size,
            duplicate: entry.duplicate,
            opened: false,
            description: entry.description
        };

        if(obj.description != "dir"){
            if(this._filters.simplify_magic){
                obj.magic = entry.finger.magic_human;
            } else {
                obj.magic = entry.finger.magic;
            }

            if(this._filters.simplify_mime){
                obj.mime = entry.finger.mime_human;
            } else{ obj.mime = entry.finger.mime; }

        }

        // Sanitize object properties
        if(obj.magic){
            if(obj.magic.length >= 170){ obj.magic = `${obj.magic.substring(0, 170)}...`; }
        } else {
            obj.magic = "empty";
        }

        [".exe", ".pdf", ".vbs", ".vba", ".bat", ".py", ".pyc", ".pl", ".rb", "js", ".jse"].forEach(function (x) {
            if (obj.filepath.endsWith(x)) {
                obj.type = "exec";
                obj.state = true;

                _self.stats.executables += 1;
            }
        });

        [".doc", ".docx", ".docm", ".dotx", ".dotm", ".docb", ".xltm", ".xls", ".xltx", ".xlsm", ".xlsx", ".xlt", ".ppt", ".pps", ".pot"].forEach(function (x) {
            if (obj.filepath.endsWith(x)) {
                obj.type = "office";
                obj.state = true;

                _self.stats.executables += 1;
            }
        });

        // Build the JSTree JSON return object
        let data = {
            text: obj.filename,
            data: {},
            a_attr: {}
        };

        data.a_attr.filepath = obj.filepath;
        data.a_attr.sha256 = entry.sha256;

        if(obj.duplicate) {
            obj.type = "duplicate";

            // Deselect duplicate file entries depending on the filter settings
            if(this._filters.deselect_duplicates){
                obj.state = false;
            }

            // Set class for CSS
            data.a_attr.filetree_duplicate = "true";

            // Update stats
            _self.stats.duplicates += 1;
        }

        if(obj.description == "dir"){
            obj.opened = true;
            obj.type = "directory";
            _self.stats.directories += 1;
        }

        if(obj.type != "directory") {
            data.data.mime = obj.mime;
            data.data.size = obj.size;
            data.data.magic = obj.magic;

            _self.stats.files += 1;

            if(entry.children.length >= 1) {
                obj.type = "container";
                obj.opened = true;
                _self.stats.containers += 1;
            }
        }

        data.a_attr.filetree_type = obj.type;
        data.type = obj.type;
        data.state = {
            selected: obj.state,
            opened: obj.opened
        };

        // Recurse this function for the child entries
        if(entry.children.length >= 1){
            entry.children.forEach(function(e){
                if(!data.hasOwnProperty("children")) { data.children = []; }
                data.children.push(_self._convert_entry(e));
            })
        }

        return data;
    }

    _reset_stats(){
        this.stats = {
            duplicates: 0,
            files: 0,
            containers: 0,
            directories: 0,
            executables: 0
        };
    }

    /**
     * Programtically toggles the highlight of a jstree item
     * @param {Object} [obj] - A jQuery object of a `a.jstree-grid.col-0` selector
     * @param {String} [file_category] - "files", "containers", "exec"
     * @param {Boolean} [highlight] - Wether to highlight or not
     */
    static highlight(obj, file_category, highlight){
        let item_type = obj.attr("filetree_type");
        let item_dup = obj.attr("filetree_duplicate");

        if(file_category == "files"){
            if(item_type != "directory"){
                if(highlight) obj.addClass("highlight");
                else obj.removeClass("highlight");
            }
        } else if (file_category == "exec"){
            if(item_type == "exec"){
                if(highlight) obj.addClass("highlight");
                else obj.removeClass("highlight");
            }
        } else if (file_category == "containers"){
            if(item_type == "container" || item_type == "office"){
                if(highlight) obj.addClass("highlight");
                else obj.removeClass("highlight");
            }
        } else if (file_category == "duplicates"){
             if(item_dup == "true"){
                if(highlight) obj.addClass("highlight");
                else obj.removeClass("highlight");
            }
        }
    }

    selected(){
        let files = [];
        $(this.sel_target).jstree("get_checked",true,true).forEach(function(e){
            files.push({
                "filepath": e.a_attr.filepath,
                "filename": e.text,
                "sha256": e.a_attr.sha256
            });
        });

       return files;
    }

    simplify(state){
        this._filters.simplify_mime = state;
        this._filters.simplify_sizes = state;
        this._filters.simplify_magic = state;

        this.refresh();
    }

    duplicates(state){
        this._filters.deselect_duplicates = state;

        this.refresh();
    }
}
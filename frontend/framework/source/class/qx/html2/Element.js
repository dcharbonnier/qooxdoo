/**
 * High performance DOM element creation
 *
 * Includes support for HTML and style attributes. Allows to
 * add children or to apply text or HTML content.
 *
 * Processes DOM insertion and modification based on the concept
 * of edit distance in an optimal way. This means that operations
 * on visible DOM nodes will be reduced at all needs.
 */
qx.Class.define("qx.html2.Element",
{
  extend : qx.core.Object,




  /*
  *****************************************************************************
     CONSTRUCTOR
  *****************************************************************************
  */

  construct : function(el)
  {
    this.base(arguments);

    this.__children = [];
    this.__attribCache = {};
    this.__styleCache = {};

    this.__contentJobs = [];
    this.__attribJobs = [];
    this.__styleJobs = [];

    if (el)
    {
      this.__element = el;
      this.__nodeName = el.tagName.toLowerCase();
      this.__created = true;
      this.__inserted = true;  // not 100% correct (bubble up?)
    }
  },




  /*
  *****************************************************************************
     STATICS
  *****************************************************************************
  */

  statics :
  {
    /*
    ---------------------------------------------------------------------------
      QUEUE MANAGMENT
    ---------------------------------------------------------------------------
    */

    __queue : [],


    /**
     * Adds the given element to the queue.
     *
     * @type static
     * @param element {Element} TODOC
     * @return {void}
     */
    addToQueue : function(element)
    {
      if (!element.__queued)
      {
        console.debug("Add to queue object[" + element.toHashCode() + "]");

        this.__queue.push(element);
        element.__queued = true;
      }
    },


    /**
     * Removes the given element from the queue.
     *
     * @type static
     * @param element {Element} TODOC
     * @return {void}
     */
    removeFromQueue : function(element)
    {
      if (element.__queued)
      {
        console.debug("Remove from queue object[" + element.toHashCode() + "]");

        this.__queue.remove(element);
        delete element.__queued;
      }
    },







    /*
    ---------------------------------------------------------------------------
      CONTENT FLUSH
    ---------------------------------------------------------------------------
    */


    /**
     * Internal helper to apply the DOM structure of the
     * defined children.
     *
     * @type static
     * @param entry {Element} the element to flush
     * @return {void}
     */
    __flushContent : function(entry)
    {
      if (entry.__text) {
        this.__flushText(entry);
      } else if (entry.__html) {
        this.__flushHtml(entry);
      } else {
        this.__flushChildren(entry);
      }
    },


    /**
     * Internal helper to apply the defined text to the DOM element.
     *
     * @type static
     * @param entry {Element} the element to flush
     * @return {void}
     */
    __flushText : function(entry)
    {
      // MSHTML does not support textContent (DOM3), but the
      // properitary innerText attribute
      if (entry.__element.textContent !== undefined)
      {
        entry.__element.textContent = entry.__text;
      }
      else
      {
        entry.__element.innerText = entry.__text;
      }
    },


    /**
     * Internal helper to apply the defined HTML to the DOM element.
     *
     * @type static
     * @param entry {Element} the element to flush
     * @return {void}
     */
    __flushHtml : function(entry)
    {
      entry.__element.innerHTML = entry.__html;
    },


    /**
     * Internal helper to apply the DOM structure of the
     * defined children.
     *
     * @type static
     * @param entry {Element} the element to flush
     * @return {void}
     */
    __flushChildren : function(entry)
    {
      // **********************************************************************
      //   Compute needed operations
      // **********************************************************************

      // Collect all element nodes of the children data
      var target = [];
      for (var i=0, a=entry.__children, l=a.length; i<l; i++)
      {
        if (!a[i].__created) {
          a[i].__create();
        }

        target.push(a[i].__element);
      }

      var parentElement = entry.__element;
      var source = parentElement.childNodes;

      // Compute edit operations
      var operations = qx.util.EditDistance.getEditOperations(source, target);

      /*
      if (qx.core.Variant.isSet("qx.debug", "on"))
      {
        // We need to convert the collection to an array otherwise
        // FireBug sometimes will display a live view of the DOM and not the
        // the snapshot at this moment.
        source = qx.lang.Array.fromCollection(source);

        console.log("Source: ", source.length + ": ", source);
        console.log("Target: ", target.length + ": ", target);
        console.log("Operations: ", operations);
      }
      */





      // **********************************************************************
      //   Process operations
      // **********************************************************************

      var job;
      var domOperations = 0;

      // Store offsets which are a result of element moves
      var offsets = [];

      for (var i=0, l=operations.length; i<l; i++)
      {
        job = operations[i];

        // ********************************************************************
        //   Apply offset
        // ********************************************************************

        if (offsets[job.pos] !== undefined)
        {
          job.pos -= offsets[job.pos];

          // We need to be sure that we don't get negative indexes.
          // This will otherwise break array/collection index access.
          if (job.pos < 0) {
            job.pos = 0;
          }
        }


        // ********************************************************************
        //   Process DOM
        // ********************************************************************

        if (job.operation === qx.util.EditDistance.OPERATION_DELETE)
        {
          // Ignore elements which are not placed at their original position anymore.
          if (parentElement.childNodes[job.pos] === job.old)
          {
            // console.log("Remove: ", job.old);
            parentElement.removeChild(job.old);
          }
        }
        else
        {
          // Operations: insert and replace

          // ******************************************************************
          //   Offset calculation
          // ******************************************************************

          // Element will be moved around in the same parent
          // We use the element on its old position and scan
          // to the begin. A counter will increment on each
          // step.
          //
          // This way we get the index of the element
          // from the beginning.
          //
          // After this we increment the offset of all affected
          // children (the following ones) until we reached the
          // current position in our operation queue. The reason
          // we stop at this point is that the following
          // childrens should already be placed correctly through
          // the operation method from the end to begin of the
          // edit distance algorithm.
          if (job.value.parentNode === parentElement)
          {
            // find the position/index where the element is stored currently
            previousIndex = -1;
            iterator = job.value;

            do
            {
              previousIndex++;
              iterator = iterator.previousSibling;
            }
            while (iterator);

            // increment all affected offsets
            for (var j=previousIndex+1; j<=job.pos; j++)
            {
              if (offsets[j] === undefined) {
                offsets[j] = 1;
              } else {
                offsets[j]++;
              }
            }
          }



          // ******************************************************************
          //   The real DOM work
          // ******************************************************************

          if (job.operation === qx.util.EditDistance.OPERATION_REPLACE)
          {
            if (parentElement.childNodes[job.pos] === job.old)
            {
              // console.log("Replace: ", job.old, " with ", job.value);
              domOperations++;
              parentElement.replaceChild(job.value, job.old);
            }
            else
            {
              // console.log("Pseudo replace: ", job.old, " with ", job.value);
              job.operation = qx.util.EditDistance.OPERATION_INSERT;
            }
          }

          if (job.operation === qx.util.EditDistance.OPERATION_INSERT)
          {
            var before = parentElement.childNodes[job.pos];

            if (before)
            {
              // console.log("Insert: ", job.value, " at: ", job.pos);
              parentElement.insertBefore(job.value, before);
              domOperations++;
            }
            else
            {
              // console.log("Append: ", job.value);
              parentElement.appendChild(job.value);
              domOperations++;
            }
          }
        }
      }
    },





    /*
    ---------------------------------------------------------------------------
      QUEUE FLUSH
    ---------------------------------------------------------------------------
    */

    /**
     * Flush the global queue for all existing element needs
     *
     * @type static
     * @return {void}
     */
    flushQueue : function()
    {
      if (this.__inFlushQueue) {
        return;
      }

      this.__inFlushQueue = true;

      var queue = this.__queue;
      var entry, child, a, i, l;


      console.info("Process: " + queue.length + " entries...");




      // **********************************************************************
      //   Create DOM elements
      // **********************************************************************

      // Creating DOM nodes could modify the queue again
      // because the generated children will also be added
      // to the queue

      i=0;

      while(queue.length > i)
      {
        for (l=queue.length; i<l; i++)
        {
          entry = queue[i];

          if(!entry.__created) {
            entry.__create();
          }

          for (var j=0, a=entry.__children, lj=a.length; j<lj; j++)
          {
            child = a[j];

            if(!child.__queued)
            {
              queue.push(child);
              child.__queued = true;
            }
          }
        }
      }






      // **********************************************************************
      //   Apply content
      // **********************************************************************

      l = queue.length;

      console.info("Flush: " + l + " entries...");

      for (i=0; i<l; i++)
      {
        entry = queue[i];

        // the invisible items
        if (!entry.__inserted)
        {
          this.__flushContent(entry);
          delete entry.__queued;
        }
      }

      for (i=0; i<l; i++)
      {
        entry = queue[i];

        // the remaining items
        if (entry.__queued)
        {
          this.__flushContent(entry);
          delete entry.__queued;
        }
      }





      // **********************************************************************
      //   Cleanup
      // **********************************************************************

      queue.length = 0;
      delete this.__inFlushQueue;
    }
  },







  /*
  *****************************************************************************
     MEMBERS
  *****************************************************************************
  */

  members :
  {
    __nodeName : "div",
    __element : null,
    __created : false,
    __inserted : false,


    /**
     * Internal helper to generate the DOM element
     *
     * @type member
     * @return {void}
     */
    __create : function()
    {
      console.debug("Create element[" + this.toHashCode() + "]");

      var el = this.__element = document.createElement(this.__nodeName);
      var style = this.__style = el.style;

      var cache;

      cache = this.__attribCache;

      for (key in cache) {
        el[key] = cache[key];
      }

      cache = this.__styleCache;

      for (key in cache) {
        style[key] = cache[key];
      }

      var children = this.__children;
      var child;

      for (var i=0, l=children.length; i<l; i++)
      {
        child = children[i];

        if (!child.__created) {
          child.__create();
        }
      }

      this.__created = true;
    },


    /**
     * Internal helper for all children addition needs
     *
     * @type member
     * @param child {var} the element to add
     * @return {void}
     * @throws an exception if the given element is already a child
     *   of this element
     */
    __addChildHelper : function(child)
    {
      if (child.__parent === this) {
        throw new Error("Already in: " + child);
      }

      if (child.__parent) {
        child.__parent.__children.remove(child);
      }

      child.__parent = this;

      // If this element is created
      if (this.__created) {
        this.self(arguments).addToQueue(this);
      }
    },


    /**
     * Internal helper for all children removal needs
     *
     * @type member
     * @param child {Element} the removed element
     * @return {void}
     * @throws an exception if the given element is not a child
     *   of this element
     */
    __removeChildHelper : function(child)
    {
      if (child.__parent !== this) {
        throw new Error("Has no child: " + child);
      }

      if (this.__created && child.__created)
      {
        // If the DOM element is really inserted, we need to remove it
        if (child.__element.parentNode === this.__element) {
          this.self(arguments).addToQueue(this);
        }
      }

      delete child.__parent;
    },


    /**
     * Returns a copy of the internal children structure.
     *
     * @type member
     * @return {Array} the children list
     */
    getChildren : function()
    {
      // protect structure using a copy
      return qx.lang.Array.copy(this.__children);
    },


    /**
     * Find the position of the given child
     *
     * @type member
     * @param child {Element} the child
     * @return {Integer} returns the position. If the element
     *   is not a child <code>-1</code> will be returned.
     */
    indexOf : function(child) {
      return this.__children.indexOf(child);
    },


    /**
     * Append the given children at the end of this element.
     *
     * @type member
     * @param child {Element} the element to insert
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element
     *   is already a child of this element
     */
    add : function(child)
    {
      this.__addChildHelper(child);
      this.__children.push(child);

      return this;
    },


    /**
     * Add all given children from this element
     *
     * @type member
     * @param varargs {var} TODOC
     * @return {Element} this object (for chaining support)
     * @throws an exception when one given element
     *   is already a child of this element
     */
    addList : function(varargs)
    {
      for (var i=0, l=arguments.length; i<l; i++) {
        this.add(arguments[i]);
      }

      return this;
    },


    /**
     * Inserts the given element after the given child.
     *
     * @type member
     * @param child {Element} the element to insert
     * @param rel {Element} the related child
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element
     *   is already a child of this element
     */
    insertAfter : function(child, rel)
    {
      this.__addChildHelper(child);
      qx.lang.Array.insertAfter(this.__children, child, rel);

      return this;
    },


    /**
     * Inserts the given element before the given child.
     *
     * @type member
     * @param child {Element} the element to insert
     * @param rel {Element} the related child
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element
     *   is already a child of this element
     */
    insertBefore : function(child, rel)
    {
      this.__addChildHelper(child);
      qx.lang.Array.insertBefore(this.__children, child, rel);

      return this;
    },


    /**
     * Inserts a new element at the given position
     *
     * @type member
     * @param child {Element} the element to insert
     * @param index {Integer} the index (starts at 0 for the
     *   first child) to insert (the index of the following
     *   children will be increased by one)
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element
     *   is already a child of this element
     */
    insertAt : function(child, index)
    {
      this.__addChildHelper(child);
      qx.lang.Array.insertAt(this.__children, child, index);

      return this;
    },


    /**
     * Remove the given child from this element.
     *
     * @type member
     * @param child {Element} The child to remove
     * @return {Element} the removed element
     * @throws an exception when the given element
     *   is not a child of this element
     */
    remove : function(child)
    {
      this.__removeChildHelper(child);
      return qx.lang.Array.remove(this.__children, child);
    },


    /**
     * Remove the child at the given index from this element.
     *
     * @type member
     * @param index {Integer} the position of the
     *   child (starts at 0 for the first child)
     * @return {Element} the removed element
     * @throws an exception when the given element
     *   is not a child of this element
     */
    removeAt : function(index)
    {
      this.__removeChildHelper(child);
      return qx.lang.Array.removeAt(this.__children, index);
    },


    /**
     * Remove all given children from this element
     *
     * @type member
     * @param varargs {arguments} the elements
     * @return {Element} this object (for chaining support)
     * @throws an exception when one given element
     *   is not a child of this element
     */
    removeList : function(varargs)
    {
      for (var i=0, l=arguments.length; i<l; i++) {
        this.remove(arguments[i]);
      }

      return this;
    },


    /**
     * Move the given child to the given index. The index
     * of the child on this index (if so) and all following
     * siblings will be increased by one.
     *
     * @type member
     * @param child {var} the child to move
     * @param index {Integer} the index (starts at 0 for the first child)
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element is not child
     *    of this element.
     */
    moveTo : function(child, index)
    {
      if (child.__parent !== this) {
        throw new Error("Has no child: " + child);
      }

      if (this.__created) {
        this.self(arguments).addToQueue(this);
      }

      var oldIndex = this.__children.indexOf(child);

      if (oldIndex === index) {
        throw new Error("Could not move to same index!");
      } else if (oldIndex < index) {
        index--;
      }

      qx.lang.Array.removeAt(this.__children, oldIndex);
      qx.lang.Array.insertAt(this.__children, child, index);

      return this;
    },


    /**
     * Move the given <code>child</code> before the child <code>rel</code>.
     *
     * @type member
     * @param child {Element} the child to move
     * @param rel {Element} the related child
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element is not child
     *   of this element.
     */
    moveBefore : function(child, rel) {
      return this.moveTo(child, this.__children.indexOf(rel));
    },


    /**
     * Move the given <code>child</code> after the child <code>rel</code>.
     *
     * @type member
     * @param child {Element} the child to move
     * @param rel {Element} the related child
     * @return {Element} this object (for chaining support)
     * @throws an exception when the given element is not child
     *   of this element.
     */
    moveAfter : function(child, rel) {
      return this.moveTo(child, this.__children.indexOf(rel) + 1);
    },


    /**
     * Returns the DOM element (if created). Please don't use this.
     * Better to use the alternatives like setText, setHtml and all
     * the children functions.
     *
     * @throws an error if the element was not yet created
     * @return {Element} the DOM element node
     */
    getElement : function()
    {
      if (!this.__created) {
        throw new Error("Element is not yet created!");
      }

      return this.__element;
    },


    /**
     * Set up the given style attribute
     *
     * @type member
     * @param key {String} the name of the style attribute
     * @param value {var} the value
     * @return {Element} this object (for chaining support)
     */
    setStyle : function(key, value)
    {
      this.__styleCache[key] = value;

      if (this.__created) {
        this.__style[key] = value;
      }

      return this;
    },


    /**
     * Get the value of the given style attribute.
     *
     * @type member
     * @param key {String} name of the style attribute
     * @return {var} the value of the style attribute
     */
    getStyle : function(key) {
      return this.__styleCache[key];
    },


    /**
     * Set up the given attribute
     *
     * @type member
     * @param key {String} the name of the attribute
     * @param value {var} the value
     * @return {Element} this object (for chaining support)
     */
    setAttribute : function(key, value)
    {
      this.__attribCache[key] = value;

      if (this.__created) {
        this.__element[key] = value;
      }

      return this;
    },


    /**
     * Get the value of the given attribute.
     *
     * @type member
     * @param key {String} name of the attribute
     * @return {var} the value of the attribute
     */
    getAttribute : function(key) {
      return this.__attribCache[key];
    },


    /**
     * Set up the HTML content of this element
     *
     * Please note that you can only use one content type:
     * children, HTML or text
     *
     * @type member
     * @param html {String} the HTML content to apply
     * @return {Element} this object (for chaining support)
     */
    setHtml : function(html)
    {
      this.__html = html;

      if (this.__created) {
        this.self(arguments).addToQueue(this);
      }

      return this;
    },


    /**
     * Returns the configured HTML content
     *
     * @type member
     * @return {String|null} the HTML
     */
    getHtml : function() {
      return this.__html || null;
    },


    /**
     * Set up the text content of this element
     *
     * Please note that you can only use one content type:
     * children, HTML or text
     *
     * @type member
     * @param text {String} the text content to apply
     * @return {Element} this object (for chaining support)
     */
    setText : function(text)
    {
      this.__text = text;

      if (this.__created) {
        this.self(arguments).addToQueue(this);
      }

      return this;
    },


    /**
     * Returns the configured text content
     *
     * @type member
     * @return {String|null} the text
     */
    getText : function() {
      return this.__text || null;
    }
  }
});

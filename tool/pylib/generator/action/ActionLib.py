#!/usr/bin/env python
# -*- coding: utf-8 -*-

################################################################################
#
#  qooxdoo - the new era of web development
#
#  http://qooxdoo.org
#
#  Copyright:
#    2006-2012 1&1 Internet AG, Germany, http://www.1und1.de
#
#  License:
#    LGPL: http://www.gnu.org/licenses/lgpl.html
#    EPL: http://www.eclipse.org/org/documents/epl-v10.php
#    See the LICENSE file in the project's top-level directory for details.
#
#  Authors:
#    * Thomas Herchenroeder (thron7)
#
################################################################################

import re, os, sys, types, glob, time, string

from misc import filetool, textutil
from generator import Context
from generator.runtime.ShellCmd import ShellCmd

##
# Library that contains various functions that implement Generator job actions
# (aka. 'triggers')
#

class ActionLib(object):
    def __init__(self, config, console_):
        self._config   = config
        self._console  = console_
        self._shellCmd = ShellCmd()

    def clean(self, cleanMap):
        assert isinstance(cleanMap, types.DictType)
        for item in cleanMap:
            self._console.info(item)
            for file in cleanMap[item]:
                file = self._config.absPath(file) 
                # resolve file globs
                for entry in glob.glob(file):
                    # safety first
                    if os.path.splitdrive(entry)[1] == os.sep:
                        raise RuntimeError, "!!! I'm not going to delete '/' recursively !!!"
                    self._shellCmd.rm_rf(entry)



    def watch(self, jobconf, confObj):
        console = Context.console
        since = time.time()
        interval = jobconf.get("watch-files/interval", 2)
        paths = jobconf.get("watch-files/paths", [])
        if not paths:
            return
        include_dirs = jobconf.get("watch-files/include-dirs", False)
        exit_on_retcode = jobconf.get("watch-files/exit-on-retcode", False)
        command = jobconf.get("watch-files/command/line", "")
        if not command:
            return
        command_tmpl = CommandLineTemplate(command)
        per_file = jobconf.get("watch-files/command/per-file", False)
        console.info("Watching changes of '%s'..." % paths)
        console.info("Press Ctrl-C to terminate.")
        pattern = self._watch_pattern(jobconf.get("watch-files/include",[])) 
        while True:
            time.sleep(interval)
            ylist = []
            for path in paths:
                console.debug("checking path '%s'" % path)
                part_list = filetool.findYoungest(path, pattern=pattern, includedirs=include_dirs, since=since)
                ylist.extend(part_list)
            since = time.time()
            if ylist:     # ylist =[(fpath,fstamp)]
                flist = [f[0] for f in ylist]
                cmd_args = {'FILELIST': ' '.join(flist)}
                console.debug("found changed files: %s" % flist)
                try:
                    if not per_file:
                        cmd = command_tmpl.safe_substitute(cmd_args)
                        self.runShellCommand(cmd)
                    else:
                        for fname in flist:
                            cmd_args['FILE']      = fname                       # foo/bar/baz.js
                            cmd_args['DIRNAME']   = os.path.dirname(fname)      # foo/bar
                            cmd_args['BASENAME']  = os.path.basename(fname)     # baz.js
                            cmd_args['EXTENSION'] = os.path.splitext(fname)[1]  # .js
                            cmd_args['FILENAME']  = os.path.basename(os.path.splitext(fname)[0])  # baz
                            cmd = command_tmpl.safe_substitute(cmd_args)
                            self.runShellCommand(cmd)
                except RuntimeError:
                    if exit_on_retcode:
                        raise
                    else:
                        pass
        return

    def _watch_pattern(self, include):
        pattern = u''
        a = []
        for entry in include:
            e = textutil.toRegExpS(entry)
            a.append(e)
        pattern = '|'.join(a)
        return pattern

    def runShellCommands(self, jobconf):
        if not jobconf.get("shell/command"):
            return

        shellcmd = jobconf.get("shell/command", "")
        if isinstance(shellcmd, list):
            for cmd in shellcmd:
                self.runShellCommand(cmd)
        else:
            self.runShellCommand(shellcmd)


    def runShellCommand(self, shellcmd):
        rc = 0
        self._shellCmd       = ShellCmd()

        self._console.info("Executing shell command \"%s\"..." % shellcmd)
        self._console.indent()

        rc = self._shellCmd.execute(shellcmd, self._config.getConfigDir())
        if rc != 0:
            raise RuntimeError, "Shell command returned error code: %s" % repr(rc)
        self._console.outdent()


class CommandLineTemplate(string.Template):
    delimiter = "%"
    idpattern = string.Template.idpattern
    pattern = r"""
        %(delim)s(?:
          (?P<escaped>%(delim)s) |   # Escape sequence of two delimiters
          (?P<named>%(id)s)      |   # delimiter and a Python identifier
          \((?P<braced>%(id)s)\) |   # delimiter and a braced identifier
          (?P<invalid>)              # Other ill-formed delimiter exprs
        )
      """ % {
              'delim': re.escape(delimiter),
              'id'   : idpattern
            } 


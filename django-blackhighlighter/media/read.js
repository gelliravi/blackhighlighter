//
// read.js - blackhighlighter supplemental javascript for reading/verifying letters.
// Copyright (C) 2009 HostileFork.com
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//   See http://hostilefork.com/blackhighlighter for documentation.
//

var ReadLetter = {};

$(document).ready(function(){

	var Globals = {
		// due to the fact that there's no "get currently active accordion section",
		// we have to track it ourself.
		lastAccordionId: null,
		commitJson: JSON.parse(PARAMS.commit),
		initialLetterText: $('#letter-text').contents().clone(),
		serverCertificates: {},
		localCertificates: {},
		successfulVerify: undefined,
		successfulReveal: undefined
	};


	// http://www.jankoatwarpspeed.com/post/2009/03/11/How-to-create-Skype-like-buttons-using-jQuery.aspx
	// lines broken differently to please javascript lint
	$('.button').hover(function(){
		$('.button img').animate(
			// first jump  
			{top: '-10px'}, 200).animate(
			{top: '-4px'}, 200).animate(
			// second jump
			{top: '-7px'}, 100).animate(
			{top: '-4px'}, 100).animate(
			// the last jump
			{top: '-6px'}, 100).animate(
			{top: '-4px'}, 100);
	});
	
	// This was tricky to figure out but it's how jquery ui demo does "View Source"
	// See it used on http://jqueryui.com/demos/accordion/
	// Invisible divs inserted after other divs at runtime, sigh!
	// Tricky function is updateDemoSource in demos.js - which only works after
	// you've run updateDemoNotes.
	// Unravel it and you get something about like this
	$('#demo-source').find('> a').click(function() {
		$(this).toggleClass('source-closed').toggleClass('source-open').next().toggle();
		return false;
	}).end().find('> div').hide();
	
	// http://www.aclevercookie.com/demos/autogrow_textarea.html
	$('textarea.expanding').autogrow();

	
	// jquery UI does tabs by index, not ID.  using this to increase readability
	// NOTE: a function as opposed to a raw map for consistency with accordionIndexForId
	function tabIndexForId(id) {
		return {
			'tabs-verify': 0, 
			'tabs-show': 1,
			'tabs-reveal': 2,
			'tabs-done': 3
		}[id];
	}

	// Bring tabs to life.
	$('#tabs').tabs();
	
	
	function notifyErrorOnTab(tab, msg) {
		$('#error-' + tab + '-msg').empty().append(document.createTextNode(msg));
		$('#error-' + tab).show();
	}
	
	function clearErrorOnTab(tab) {
		$('#error-' + tab).hide();
	}

	// NOTE: This is a function, not a map.
	function accordionIndexAndChildForId(certKey) {
		var index = null;
		var child = null;
		$('#accordion').children().each(function(i) {
			if ($(this).attr('title') == certKey) {
				if (index !== null) {
					throw 'More than one accordion tab for certificate' + certKey;
				}
				index = i;
				child = $(this);
			}
		});
		if (index === null) {
			throw 'Cannot find accordion tab for certificate ' + certKey;
		}
		return {'index': index, 'child': child};
	}
	
	function accordionIndexForId(certKey) {
		return accordionIndexAndChildForId(certKey).index;
	}

	function accordionHeaderForId(certKey) {
		return accordionIndexAndChildForId(certKey).child.children().filter("a");
	}
	
	function accordionContentForId(certKey) {
		return accordionIndexAndChildForId(certKey).child.children().filter("div");
	}
	
	// Hide the accordion from view until multiple reveals have UI better implemented
	// and CSS issues are solved
	$('#accordion').hide();
	
	// Bring accordion to life
	// http://jqueryui.com/demos/accordion/
	// Note: demo code sample is incorrect
	// http://dev.jqueryui.com/ticket/4468
	$('#accordion').accordion({ 
		'collapsible': true,
		'header': 'a'
	});
	
	$('#accordion').bind('accordionchange', function(event, ui) {
		// ui.newHeader // jQuery object, activated header
		// ui.oldHeader // jQuery object, previous header
		// ui.newContent // jQuery object, activated content
		// ui.oldContent // jQuery object, previous content
		
		// we don't get the index, we get the header and the content
		// the header seems to be the expected object, but the
		// content is incorrect
		// http://dev.jqueryui.com/ticket/4469
		if ((ui.newHeader !== null) && (ui.newHeader.length !== 0)) {
			Globals.lastAccordionId = ui.newHeader.parent().attr('title');
		} else {
			Globals.lastAccordionId = null;
		}
	});

	// Pass -1 to close all (only possible with collapsible:true).
	$('#accordion').accordion('activate', -1);
	
	ReadLetter.addCertificate = function(certJson, server) {

		var contents = certJson.salt;
		var numRedactionsInCertificate = 0;
		for (var redactionSpanIndex = 0; redactionSpanIndex < certJson.redactions.length; redactionSpanIndex++) {
			contents += certJson.redactions[redactionSpanIndex];
			numRedactionsInCertificate++;		
		}
		
		var contentHash = SHA256(contents);
		var claimedHash = certJson.sha256;
		if (contentHash != claimedHash) {
			throw 'Invalid certificate: content hash is ' + contentHash + ' while claimed hash is ' + claimedHash;
		}

		var numPlaceholdersForKey = 0;
		for (var commitSpanIndex = 0; commitSpanIndex < Globals.commitJson.spans.length; commitSpanIndex++) {
			var commitSpan = Globals.commitJson.spans[commitSpanIndex];
			if (commitSpan.sha256 == claimedHash) {
				numPlaceholdersForKey++;
			}
		}
		// warn user if certificate is useless, need better UI
		if (numPlaceholdersForKey === 0) {
			throw 'Certificate does not match any placeholders.';
		}
		if (numPlaceholdersForKey != numRedactionsInCertificate) {
			throw 'Certificate contains ' + numRedactionsInCertificate + ' redactions for key when letter needs ' + 
				numPlaceholdersForKey + ' for that key';
		}
	
		if (server) {
			Globals.serverCertificates[certJson.sha256] = certJson;
		} else {
			if (certJson.sha256 in Globals.serverCertificates) {
				throw 'Local certificate already revealed on server.';
			} else if (certJson.sha256 in Globals.localCertificates) {
				throw 'You have already revealed the local certificate.';
			} else {
				Globals.localCertificates[certJson.sha256] = certJson;
			}
		}

		var namePart = certJson.name ? (': ' + certJson.name) : '';
		accordionHeaderForId(certJson.sha256).empty().append(
			'<span>' + (server ? 'Server Certificate' : 'Local Certificate') + namePart + '</span>');
		var spanPart = $('<span></span>');
		spanPart.append($('<p>' + JSON.stringify(certJson, null, ' ') + '</p>'));
		if (!server) {
			var buttonPart = $('<input type="button" value="Remove" name="' + certJson.sha256 + '"></input>');
			buttonPart.click(function() {
				ReadLetter.removeCertificate(this.name);
				return true;
			});
			spanPart.append(buttonPart);
		}			
		accordionContentForId(certJson.sha256).empty().append(spanPart);
	};


	try {
		var revealsJson = JSON.parse(PARAMS.reveals);
		if (!isArray(revealsJson)) {
			throw "Expected server to give reveals[] as JSON array";
		}
		for (var revealsIndex = 0; revealsIndex < revealsJson.length; revealsIndex++) {
			ReadLetter.addCertificate(revealsJson[revealsIndex], true);
		}
	} catch(err) {
		throw 'Reveal posted on server did not pass client verification check: ' + err; 
	}
	
	
	// The user is allowed to type in or paste certificates.  For reasons of readability
	// and to give users the ability to easily extract individual certificates, we
	// accept a lot of non-JSON-parser-compatible stuff (like comments and arrays without
	// commas).  This function tries to reform the pseudo-JSON into real JSON.
	function tidyInputForJsonParser(pseudoJson) {
		if (!isString(pseudoJson)) {
			throw 'Passed a non-string into tidyInputForJsonParser';
		}
		
		var tidyJson = '';
	
		// start by removing comments and whitespace
		var inputLength = pseudoJson.length;
		var index = 0;
		var whitespacePending = false;
		var skipNext = false;
		var last = null;
		// NOTE: Internet Explorer doesn't allow array subscript access e.g. psuedoJson[0] (?)
		var current = (inputLength > 0) ? pseudoJson.charAt(0) : null;
		var next = undefined;
		function pushCharacter(ch) {
			if (ch == ' ' || ch == '\t' || ch == '\n') {
				whitespacePending = true;
			} else {
				if (whitespacePending && (tidyJson !== '')) {
					tidyJson += ' ';
					whitespacePending = false;
				}
				tidyJson += ch;
			}
		}
		function pushWhitespace() {
			// we strip out all whitespace for the moment...but we could collapse it
			if (false) {
				whitespacePending = true;
			}
		}
		function skipNextCharacter() {
			skipNext = true;
		}

		var topmostBraceCount = 0;
		var braceDepth = 0;
		var commaFound = undefined;
		
		var stringType = null;
		var commentType = null;		
		while (current !== null) {
			next = (index == inputLength-1) ? null : pseudoJson.charAt(index+1);

			if (skipNext) {
			
				skipNext = false;
				
			} else if (commentType !== null) {
			
				switch (commentType) {
					case '//':
						if (current == '\n') {
							commentType = null;
						}
						break;
						
					case '/*':
						if (current == '*' && next == '/') {
							skipNextCharacter();
							commentType = null;
						}
						break;
						
					default:
						throw 'Unknown comment type';
				}
				
			} else if (stringType !== null) {
			
				if (current == '\n') {
					throw 'End of line in middle of quote context';
				}
				
				if (current == '\\') {
					if (next == stringType) {
						// it's an escaped quote marker, so it needs to go into the
						// output stream... go ahead and write the escape and the
						// quote end and then skip the quote end so we don't
						// see it in our next iteration and think it's a real quote ending
						pushCharacter(current);
						pushCharacter(next);
						skipNextCharacter(); 
					} else {
						pushCharacter(current);
					}
				} else if (current == stringType) {
					pushCharacter(current);
					stringType = null;
				} else {
					pushCharacter(current);
				}
				
			} else {
			
				// general handling if we are not (yet) in a quote or in a string
				switch (current) {
					case '{':
						if (braceDepth === 0) {
							if (topmostBraceCount > 0) {
								if (!commaFound) {
									pushCharacter(',');
									pushWhitespace();
								}
								commaFound = undefined;
							}
							topmostBraceCount++;
						}
						braceDepth++;
						pushCharacter(current);
						break;

					case ',':
						if (!isUndefined(commaFound)) {
							commaFound = true;
						}
						pushCharacter(current);
						break;
						
					case '}':
						if (braceDepth === 0) {
							throw 'Bad brace nesting in Json input';
						} else {
							braceDepth--;
							if (braceDepth === 0) {
								commaFound = false;
							}
						}
						pushCharacter(current);
						break;
					
					case '"':
					case "'":
						stringType = current;
						pushCharacter(current);
						break;
						
					case '/':
						if (next == '*') {
							commentType = '/*';
							skipNextCharacter();
						} else if (next == '/') {
							commentType = '//';
							skipNextCharacter();
						} else {
							pushCharacter(current);
						}
						break;
						
					case '\n':
					case ' ':
					case '\t':
						pushWhitespace();
						break;
						
					default:
						pushCharacter(current);
						break;
				}
			}
			last = current;
			current = next;
			index++;
		}

		// if we have something like "{foo},{bar}", then ensure it has brackets e.g. "[{foo},{bar}]"
		if (topmostBraceCount > 1) {
			if (tidyJson[0] != '[') {
				tidyJson = '[' + tidyJson;
			}
			if (tidyJson[tidyJson.length-1] != ']') {
				tidyJson = tidyJson + ']';
			}
		}

		return tidyJson;
	}
	
	
	function updateTabEnables() {
		$('#tabs').tabs('enable', tabIndexForId('tabs-verify'));		
		$('#tabs').tabs('enable', tabIndexForId('tabs-show'));
		if (keysForObject(Globals.localCertificates).length > 0) {
			$('#tabs').tabs('enable', tabIndexForId('tabs-reveal'));
			$('#buttons-show-before').hide();			
			$('#buttons-show-after').show();
		} else {
			$('#tabs').tabs('disable', tabIndexForId('tabs-reveal'));
			$('#buttons-show-after').hide();			
			$('#buttons-show-before').show();
		}
	}
	
	updateTabEnables();
	
	var lastTabId = 'tabs-verify'; // we start on verify tab, and don't get a select message
	// Bind function for what happens on tab select
	$('#tabs').bind('tabsselect', function(event, ui) {

		// Objects available in the function context:
		// ui.tab     // anchor element of the selected (clicked) tab
		// ui.panel   // element, that contains the selected/clicked tab contents
		// ui.index   // zero-based index of the selected (clicked) tab

		switch(ui.panel.id) {
			case 'tabs-verify':
				$('#progress-verify').hide();
				clearErrorOnTab('verify');
				break;
			
			case 'tabs-show':		
				var certIndices = {};
							
				function fillInPlaceholder(placeholder) {

					var shaHexDigest = placeholder.attr('title');

					if (!placeholder.hasClass('revealed')) {
						var publiclyRevealed = true;
						var certificate = Globals.serverCertificates[shaHexDigest];
						if (!certificate) {
							publiclyRevealed = false;
							certificate = Globals.localCertificates[shaHexDigest];
						}
						if (certificate) {
							if (!certIndices[shaHexDigest]) {
								certIndices[shaHexDigest] = 0;
							}
							placeholder.empty().append(document.createTextNode(certificate.redactions[certIndices[shaHexDigest]]));
							certIndices[shaHexDigest]++;

							placeholder.removeClass('protected');
							if (publiclyRevealed) {
								placeholder.addClass('revealed');
							} else {
								placeholder.addClass('verified');
							}
						}
					}

					// These reference links help to determine which reveal a placeholder is from,
					// which is useful in cases of multiple reveals (not currently supported in the UI)
					if (false) {
						var referenceLink = $('<span class="certlink" title="' + shaHexDigest + '"><sup>' + '[' +
							(accordionIndexForId(shaHexDigest)+1) + ']' + '</sup></span>');
						referenceLink.click(function() {
							// As per example #5, you can't make a closure using shaHexDigest here
							// http://blog.morrisjohns.com/javascript_closures_for_dummies
							// REVIEW: way to do this that frees up the title for something else?
							ReadLetter.viewCertificate($(this).attr('title'));
							return true;
						});
						placeholder.after(referenceLink);
					}
				}

				// we used to convert the JSON into a public HTML fragment...but server-side generation
				// is better for running in non-javascript contexts.  Save what the server made in the
				// beginning so that if we mess with it we can restore it back.			
				if (true) {
					$('#letter-text').empty().append(Globals.initialLetterText.clone());
					$('#letter-text').find('span').filter('.placeholder').each(function(i) {
						fillInPlaceholder($(this));		
					});
				} else {
					// set letter text to the public html for now
					// we strip off the envelope and ignore it...
					var letterText = $('#letter-text').empty();
					for (var commitSpanIndex = 0; commitSpanIndex < Globals.commitJson.spans.length; commitSpanIndex++) {
						var commitSpan = Globals.commitJson.spans[commitSpanIndex];
						if (isString(commitSpan)) {
							// line breaks must be converted to br nodes
							var commitSpanSplit = commitSpan.split('\n');
							letterText.append(commitSpanSplit[0]);
							for (var commitSpanSplitIndex = 1; commitSpanSplitIndex < commitSpanSplit.length; commitSpanSplitIndex++) {
								letterText.append('<br />');
								letterText.append(commitSpanSplit[commitSpanSplitIndex]);
							}
						} else {
							var displayLength = parseInt(commitSpan.displayLength, 10);
							var placeholderString = '';
							for (var fillIndex = 0; fillIndex < displayLength; fillIndex++) {
								placeholderString += '?';
							}
							
							// REVIEW: use hex digest as title for query, or do something more clever?
							// e.g. we could add a method onto the element or keep a sidestructure
							var placeholder = $('<span class="placeholder" title="' + commitSpan.sha256 + '">' +
								placeholderString + '</span>');
							placeholder.addClass('protected');
							letterText.append(placeholder);

							fillInPlaceholder(placeholder);

						}
					}
				}
				
				break;
		
			case 'tabs-reveal':
				clearErrorOnTab('reveal');
				$('#progress-reveal').hide();
				$('#json-reveal').empty().append(
					document.createTextNode(JSON.stringify(dropObjectKeysToMakeSortedArray(Globals.localCertificates), null, ' ')));
				break;
		
			case 'tabs-done':
				// nothing to do?
				break;

			default:
				throw 'no match for tab in read.js';
		}
		lastTabId = ui.panel.id;
	});

	switch (PARAMS.tabstate) {
		case 'verify':
			$('#tabs').tabs('select', tabIndexForId('tabs-verify'));
			break;
			
		case 'show':
			$('#tabs').tabs('select', tabIndexForId('tabs-show'));
			break;
			
		default:
			throw 'invalid PARAMS.tabstate';
	}	

	
	ReadLetter.viewCertificate = function(certKey) {
		// first make sure we're on the verify tab
		$('#tabs').tabs('select', tabIndexForId('tabs-verify'));
		if (Globals.lastAccordionId != certKey) {
			$('#accordion').accordion('activate', accordionIndexForId(certKey));
		}
	};

	
	ReadLetter.removeCertificate = function(certKey) {
	
		if (!(certKey in Globals.localCertificates)) {
			throw 'Attempt to remove certificate that is not in the local list.';
		}
		
		delete Globals.localCertificates[certKey];

		accordionHeaderForId(certKey).empty().append(
				'<span>' + 'Certificate not revealed' + '</span>');
		accordionContentForId(certKey).empty().append(
				'<span>' + 'No information about this reveal available' + '</span>');
		
		updateTabEnables();
	};
	

	ReadLetter.previousStep = function() {
		$('#tabs').tabs('select', tabIndexForId(lastTabId)-1);
	};


	ReadLetter.nextStep = function() {
		$('#tabs').tabs('select', tabIndexForId(lastTabId)+1);
	};
	
	ReadLetter.clearCertificateInputField = function() {
		$('#certificates').get(0).value = '';
	};
	
	function finalizeVerifyUI() {
		if (this.timerId !== null) {
			window.clearTimeout(this.timerId);
		}
		this.timerId = undefined;

		updateTabEnables();
		
		if (Globals.successfulVerify) {
			ReadLetter.clearCertificateInputField();
			$('#tabs').tabs('select', tabIndexForId('tabs-show'));
		}
		
		$('#progress-verify').hide();
		$('#buttons-verify').show();
		
		Globals.successfulVerify = undefined;
	}
	finalizeVerifyUI.timerCallback = function() {
		this.timerId = null;
		if (Globals.successfulVerify) {
			finalizeVerifyUI();
		} // we expect the pending Ajax call to complete and reset this to undefined
	};
	finalizeVerifyUI.timerId = undefined;
	
	ReadLetter.verify = function() {
		clearErrorOnTab('verify');
	
		var certificateInput = $('#certificates').get(0).value;
		if (trimAllWhitespace(certificateInput) === '') {
			// if they haven't typed anything into the box
			$('#tabs').tabs('select', tabIndexForId('tabs-show'));
		} else {
			$('#tabs').tabs('disable', tabIndexForId('tabs-show'));
			$('#tabs').tabs('disable', tabIndexForId('tabs-reveal'));
			$('#progress-verify').show();
			$('#buttons-verify').hide();
			Globals.successfulVerify = false;
		
			// We set a timer to make sure there is enough of a delay that the
			// user feels confident that something actually happened
			finalizeVerifyUI.timerId = window.setTimeout(finalizeVerifyUI.timerCallback, 3000);

			var revealsJson = null;
			// Catch parsing errors and put them in an error message
			try {
				var tidyCertText = tidyInputForJsonParser(certificateInput);
				
				revealsJson = JSON.parse(tidyCertText);	
			} catch(errParse) {
				notifyErrorOnTab('verify', errParse);
				// do not continue to next tab
				finalizeVerifyUI();
			}

			if (revealsJson) {
				try {
					if (isArray(revealsJson)) {
						if (true) {
							throw "User interface for multiple certificates is not currently available";
						} else {
							for (var revealObjIndex = 0; revealObjIndex < revealsJson.length; revealObjIndex++) {
								var certJson = revealsJson[revealObjIndex];
								ReadLetter.addCertificate(certJson, false);
							}
						}
					} else {
						ReadLetter.addCertificate(revealsJson, false);
					}

					Globals.successfulVerify = true;
					if (finalizeVerifyUI.timerId === null) {
						finalizeVerifyUI();
					}
				} catch(errAdd) {
					notifyErrorOnTab('verify', errAdd);
					// do not continue to next tab
					finalizeVerifyUI();
				}
			}
		}
	};

	function finalizeRevealUI() {
		if (this.timerId !== null) {
			window.clearTimeout(this.timerId);
		}
		this.timerId = undefined;
		
		if (Globals.successfulReveal) {
			// We want to redirect to the "show" page for this letter
			// Which means we have to reload if we were already on the letter's "show" URL
			if (PARAMS.tabstate == 'show') {
				// Reload semantics vary in Java and browser versions
				// http://grizzlyweb.com/webmaster/javascripts/refresh.asp
				window.location.reload(true);
			} else {
				window.navigate(absoluteFromRelativeURL(PARAMS.show_url));
			}
		} else {
			$('#buttons-reveal').show();
			$('#tabs').tabs('enable', tabIndexForId('tabs-verify'));
			$('#tabs').tabs('enable', tabIndexForId('tabs-show'));
			
			// we only hide the progress bar in the error case, because otherwise we
			// want the animation to stick around until the redirect has completed
			$('#progress-reveal').hide();
		}
		
		Globals.successfulReveal = undefined;
	}
	finalizeRevealUI.timerCallback = function() {
		this.timerId = null;
		if (Globals.successfulReveal) {
			finalizeRevealUI();
		} // else we expect the pending Ajax call to complete and reset this to undefined
	};
	finalizeRevealUI.timerId = undefined;
	
	ReadLetter.reveal = function() {
	
		$('#tabs').tabs('disable', tabIndexForId('tabs-verify'));
		$('#tabs').tabs('disable', tabIndexForId('tabs-show'));
		// jquery UI does not support an indeterminate progress bar yet
		// http://docs.jquery.com/UI/API/1.7/Progressbar
		// Currently using an animated GIF from http://www.ajaxload.info/
		$('#progress-reveal').show();
		$('#buttons-reveal').hide();
		
		// We set a timer to make sure there is enough of a delay that the
		// user feels confident that something actually happened
		finalizeRevealUI.timerId = window.setTimeout(finalizeRevealUI.timerCallback, 3000);

		Globals.successfulReveal = false;
		
		// http://docs.jquery.com/Ajax/jQuery.ajax
		$.ajax({
			type: 'POST',
			dataType: 'json', // expected response type from server
			url: PARAMS.reveal_url,
			data: {
				'reveals': JSON.stringify(dropObjectKeysToMakeSortedArray(Globals.localCertificates), null, ' ') // sends as UTF-8
			},
			success: function(resultJson){
				if (resultJson.error) {
					notifyErrorOnTab('reveal', resultJson.error.msg);
					finalizeRevealUI();
				} else {
					Globals.successfulReveal = true;
				}
				if (finalizeRevealUI.timerId === null) {
					finalizeRevealUI();
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				finalizeRevealUI();
				
				// "this" contains the options for this ajax request
				if (errorThrown) {
					notifyErrorOnTab('The jQuery AJAX subsystem threw an error: ' + errorThrown);
				} else {
					switch (textStatus) {
						case 'timeout':
							notifyErrorOnTab('reveal', 'The POST reveal request timed out on ' + PARAMS.reveal_url + 
								' --- check your network connection and try again.');
							break;
							
						case 'error':
							notifyErrorOnTab('reveal', 'There was an error with the web server during your request.');
							break;
							
						case 'notmodified':
						case 'parsererror':
							notifyErrorOnTab('reveal', 'Unexpected error code during Ajax POST: ' + textStatus);
							break;
							
						default:
							notifyErrorOnTab('reveal', 'Unexpected error code during Ajax POST: ' + textStatus);
							break;
					}
				}
			}
		});
	};
	
});